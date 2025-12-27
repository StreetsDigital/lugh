/**
 * Agent Pool Manager
 * ==================
 *
 * The "God-Tier" orchestrator component that manages the agent pool.
 *
 * Responsibilities:
 * - Track all active agents
 * - Dispatch tasks to available agents
 * - Monitor agent health (heartbeats)
 * - Handle agent failures
 * - Scale pool based on demand
 */

import {
  getRedisClient,
  type RedisClient,
  type AgentRegisterMessage,
  type AgentHeartbeatMessage,
  type AgentStatusMessage,
  type TaskResultMessage,
  type ToolCallMessage,
  type AgentMessage,
  type TaskDispatchMessage,
  type AgentDeregisterMessage,
} from '../redis/client';

// Configuration
const HEARTBEAT_TIMEOUT_MS = parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '15000', 10);
const MAX_AGENTS = parseInt(process.env.MAX_AGENTS || '12', 10);

/**
 * Agent info tracked by orchestrator
 */
interface AgentInfo {
  id: string;
  status: 'idle' | 'busy' | 'stopping' | 'error' | 'offline';
  currentTaskId: string | null;
  lastHeartbeat: Date;
  capabilities: {
    maxConcurrentTasks: number;
    supportedLanguages: string[];
    hasWorktree: boolean;
    worktreePath?: string;
  };
  system: {
    hostname: string;
    platform: string;
    memory: number;
    cpus: number;
  };
  resources: {
    memoryUsedMb: number;
    cpuPercent: number;
  };
}

/**
 * Task tracking
 */
interface TaskInfo {
  id: string;
  status: 'queued' | 'dispatched' | 'running' | 'verifying' | 'completed' | 'failed' | 'cancelled';
  agentId: string | null;
  conversationId: string;
  platform: string;
  description: string;
  queuedAt: Date;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  result: TaskResultMessage | null;
  attempts: number;
}

/**
 * Event handlers for pool events
 */
interface PoolEventHandlers {
  onTaskComplete?: (task: TaskInfo, result: TaskResultMessage) => void | Promise<void>;
  onTaskFailed?: (task: TaskInfo, result: TaskResultMessage) => void | Promise<void>;
  onToolCall?: (agentId: string, taskId: string, tool: ToolCallMessage['tool']) => void | Promise<void>;
  onAgentDead?: (agentId: string) => void | Promise<void>;
}

/**
 * Agent Pool Manager
 */
export class AgentPoolManager {
  private redis: RedisClient;
  private agents: Map<string, AgentInfo> = new Map();
  private tasks: Map<string, TaskInfo> = new Map();
  private handlers: PoolEventHandlers = {};
  private healthCheckInterval: Timer | null = null;

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Start the pool manager
   */
  async start(): Promise<void> {
    console.log('[PoolManager] Starting...');

    // Connect to Redis
    await this.redis.connect();

    // Subscribe to agent channels
    await this.redis.subscribeToAgents((message) =>
      this.handleAgentMessage(message)
    );

    // Start health check loop
    this.startHealthCheck();

    console.log(`[PoolManager] Ready (max agents: ${MAX_AGENTS})`);
  }

  /**
   * Stop the pool manager
   */
  async stop(): Promise<void> {
    console.log('[PoolManager] Stopping...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Kill all agents
    for (const agent of this.agents.values()) {
      await this.redis.killAgent(agent.id, 'Orchestrator shutdown');
    }

    await this.redis.disconnect();

    console.log('[PoolManager] Stopped');
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: PoolEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Dispatch a task to an available agent
   */
  async dispatchTask(task: {
    id: string;
    description: string;
    codebaseId: string;
    worktreePath: string;
    conversationId: string;
    platform: 'telegram' | 'slack' | 'web' | 'github';
    priority?: 'critical' | 'high' | 'normal' | 'low';
    context?: {
      previousAttempts: number;
      recoveryHints: string[];
      memoryContext: string;
    };
  }): Promise<{ dispatched: boolean; agentId?: string; queuePosition?: number }> {
    // Find available agent
    const agent = this.findAvailableAgent();

    // Track task
    const taskInfo: TaskInfo = {
      id: task.id,
      status: agent ? 'dispatched' : 'queued',
      agentId: agent?.id || null,
      conversationId: task.conversationId,
      platform: task.platform,
      description: task.description,
      queuedAt: new Date(),
      dispatchedAt: agent ? new Date() : null,
      completedAt: null,
      result: null,
      attempts: task.context?.previousAttempts || 0,
    };
    this.tasks.set(task.id, taskInfo);

    if (agent) {
      // Dispatch immediately
      const message: TaskDispatchMessage = {
        type: 'task:dispatch',
        taskId: task.id,
        targetAgentId: agent.id,
        task: {
          description: task.description,
          codebaseId: task.codebaseId,
          worktreePath: task.worktreePath,
          priority: task.priority || 'normal',
          context: task.context,
        },
        timestamp: new Date().toISOString(),
        conversationId: task.conversationId,
        platform: task.platform,
      };

      await this.redis.dispatchTask(message);

      // Update agent status
      agent.status = 'busy';
      agent.currentTaskId = task.id;

      console.log(`[PoolManager] Dispatched task ${task.id} to agent ${agent.id}`);

      return { dispatched: true, agentId: agent.id };
    } else {
      // Queue the task
      const priority = this.getPriorityScore(task.priority || 'normal');
      await this.redis.queueTask(task.id, priority);
      const queueLength = await this.redis.getQueueLength();

      console.log(`[PoolManager] Queued task ${task.id} (position: ${queueLength})`);

      return { dispatched: false, queuePosition: queueLength };
    }
  }

  /**
   * Stop a specific task
   */
  async stopTask(taskId: string, reason: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || !task.agentId) {
      return false;
    }

    await this.redis.stopAgent(task.agentId, taskId, reason);
    return true;
  }

  /**
   * Get pool status
   */
  getStatus(): {
    agents: Array<{
      id: string;
      status: string;
      currentTask: string | null;
      lastHeartbeat: string;
    }>;
    tasks: {
      queued: number;
      running: number;
      completed: number;
      failed: number;
    };
  } {
    const agentList = Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      status: a.status,
      currentTask: a.currentTaskId,
      lastHeartbeat: a.lastHeartbeat.toISOString(),
    }));

    const taskStats = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'queued':
        case 'dispatched':
          taskStats.queued++;
          break;
        case 'running':
        case 'verifying':
          taskStats.running++;
          break;
        case 'completed':
          taskStats.completed++;
          break;
        case 'failed':
        case 'cancelled':
          taskStats.failed++;
          break;
      }
    }

    return { agents: agentList, tasks: taskStats };
  }

  /**
   * Handle messages from agents
   */
  private async handleAgentMessage(message: AgentMessage): Promise<void> {
    switch (message.type) {
      case 'agent:register':
        await this.handleAgentRegister(message as AgentRegisterMessage);
        break;

      case 'agent:heartbeat':
        await this.handleHeartbeat(message as AgentHeartbeatMessage);
        break;

      case 'agent:status':
        await this.handleStatusUpdate(message as AgentStatusMessage);
        break;

      case 'task:result':
        await this.handleTaskResult(message as TaskResultMessage);
        break;

      case 'agent:tool-call':
        await this.handleToolCall(message as ToolCallMessage);
        break;

      case 'agent:deregister':
        await this.handleAgentDeregister(message as AgentDeregisterMessage);
        break;
    }
  }

  /**
   * Handle agent registration
   */
  private async handleAgentRegister(message: AgentRegisterMessage): Promise<void> {
    const agent: AgentInfo = {
      id: message.agentId,
      status: 'idle',
      currentTaskId: null,
      lastHeartbeat: new Date(),
      capabilities: message.capabilities,
      system: message.system,
      resources: { memoryUsedMb: 0, cpuPercent: 0 },
    };

    this.agents.set(message.agentId, agent);

    console.log(
      `[PoolManager] Agent registered: ${message.agentId} (${message.system.hostname})`
    );

    // Try to assign queued tasks
    await this.processQueue();
  }

  /**
   * Handle agent heartbeat
   */
  private async handleHeartbeat(message: AgentHeartbeatMessage): Promise<void> {
    const agent = this.agents.get(message.agentId);
    if (!agent) {
      // Unknown agent - might have missed registration
      console.warn(`[PoolManager] Heartbeat from unknown agent: ${message.agentId}`);
      return;
    }

    agent.lastHeartbeat = new Date();
    agent.status = message.status;
    agent.resources = message.resources;

    if (message.currentTask) {
      agent.currentTaskId = message.currentTask.taskId;

      // Update task status
      const task = this.tasks.get(message.currentTask.taskId);
      if (task) {
        task.status = 'running';
      }
    }
  }

  /**
   * Handle agent status update
   */
  private async handleStatusUpdate(message: AgentStatusMessage): Promise<void> {
    const agent = this.agents.get(message.agentId);
    if (!agent) return;

    agent.status = message.currentStatus;

    console.log(
      `[PoolManager] Agent ${message.agentId}: ${message.previousStatus} -> ${message.currentStatus} (${message.reason})`
    );

    // If agent became idle, try to assign queued tasks
    if (message.currentStatus === 'idle') {
      agent.currentTaskId = null;
      await this.processQueue();
    }
  }

  /**
   * Handle task result
   */
  private async handleTaskResult(message: TaskResultMessage): Promise<void> {
    const task = this.tasks.get(message.taskId);
    if (!task) {
      console.warn(`[PoolManager] Result for unknown task: ${message.taskId}`);
      return;
    }

    // Update task
    task.status = message.success ? 'completed' : 'failed';
    task.completedAt = new Date();
    task.result = message;

    // Update agent
    const agent = this.agents.get(message.agentId);
    if (agent) {
      agent.status = 'idle';
      agent.currentTaskId = null;
    }

    console.log(
      `[PoolManager] Task ${message.taskId} ${message.status} (agent: ${message.agentId}, duration: ${message.durationMs}ms)`
    );

    // Call handlers
    if (message.success && this.handlers.onTaskComplete) {
      await this.handlers.onTaskComplete(task, message);
    } else if (!message.success && this.handlers.onTaskFailed) {
      await this.handlers.onTaskFailed(task, message);
    }

    // Process queue for newly idle agent
    await this.processQueue();
  }

  /**
   * Handle tool call (for streaming)
   */
  private async handleToolCall(message: ToolCallMessage): Promise<void> {
    if (this.handlers.onToolCall) {
      await this.handlers.onToolCall(message.agentId, message.taskId, message.tool);
    }
  }

  /**
   * Handle agent deregistration
   */
  private async handleAgentDeregister(message: { agentId: string }): Promise<void> {
    this.agents.delete(message.agentId);
    console.log(`[PoolManager] Agent deregistered: ${message.agentId}`);
  }

  /**
   * Find an available agent
   */
  private findAvailableAgent(): AgentInfo | null {
    for (const agent of this.agents.values()) {
      if (agent.status === 'idle') {
        return agent;
      }
    }
    return null;
  }

  /**
   * Process queued tasks
   */
  private async processQueue(): Promise<void> {
    const agent = this.findAvailableAgent();
    if (!agent) return;

    const taskId = await this.redis.dequeueTask();
    if (!taskId) return;

    const task = this.tasks.get(taskId);
    if (!task) {
      // Task was removed from tracking - skip
      await this.processQueue();
      return;
    }

    // Re-dispatch the task
    await this.dispatchTask({
      id: task.id,
      description: task.description,
      codebaseId: '', // Would need to store this
      worktreePath: '', // Would need to store this
      conversationId: task.conversationId,
      platform: task.platform as 'telegram' | 'slack' | 'web' | 'github',
    });
  }

  /**
   * Start health check loop
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkAgentHealth().catch((err) => {
        console.error('[PoolManager] Health check error:', err);
      });
    }, HEARTBEAT_TIMEOUT_MS);
  }

  /**
   * Check agent health
   */
  private async checkAgentHealth(): Promise<void> {
    const now = new Date();

    for (const agent of this.agents.values()) {
      const timeSinceHeartbeat = now.getTime() - agent.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.warn(
          `[PoolManager] Agent ${agent.id} missed heartbeat (${timeSinceHeartbeat}ms)`
        );

        // Mark as offline
        agent.status = 'offline';

        // Handle current task if any
        if (agent.currentTaskId) {
          const task = this.tasks.get(agent.currentTaskId);
          if (task) {
            task.status = 'failed';
            task.completedAt = new Date();

            if (this.handlers.onTaskFailed) {
              await this.handlers.onTaskFailed(task, {
                type: 'task:result',
                taskId: task.id,
                agentId: agent.id,
                status: 'failed',
                success: false,
                claims: {
                  commitsCreated: 0,
                  filesModified: [],
                  testsRun: false,
                  testsPassed: false,
                },
                summary: 'Agent died during execution',
                error: {
                  message: 'Agent heartbeat timeout',
                  recoverable: true,
                },
                startTime: task.dispatchedAt?.toISOString() || '',
                endTime: now.toISOString(),
                durationMs: 0,
              });
            }
          }
        }

        // Notify handler
        if (this.handlers.onAgentDead) {
          await this.handlers.onAgentDead(agent.id);
        }

        // Remove agent
        this.agents.delete(agent.id);
      }
    }
  }

  /**
   * Get priority score for queue ordering
   */
  private getPriorityScore(priority: 'critical' | 'high' | 'normal' | 'low'): number {
    switch (priority) {
      case 'critical':
        return 1000;
      case 'high':
        return 100;
      case 'normal':
        return 10;
      case 'low':
        return 1;
    }
  }
}

// Singleton instance
let poolManager: AgentPoolManager | null = null;

/**
 * Get or create pool manager singleton
 */
export function getPoolManager(): AgentPoolManager {
  if (!poolManager) {
    poolManager = new AgentPoolManager();
  }
  return poolManager;
}
