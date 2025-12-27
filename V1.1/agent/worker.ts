/**
 * Agent Worker
 * ============
 *
 * Main entry point for agent containers.
 *
 * Lifecycle:
 * 1. Connect to Redis
 * 2. Register with orchestrator
 * 3. Listen for task dispatch
 * 4. Run Claude Code sessions
 * 5. Report results back
 * 6. Send heartbeats every 5 seconds
 */

import { v4 as uuid } from 'uuid';
import os from 'os';
import {
  getRedisClient,
  AGENT_CHANNELS,
  type TaskDispatchMessage,
  type ControlStopMessage,
  type ControlKillMessage,
  type OrchestratorMessage,
} from '../redis/client';
import { Heartbeat } from './heartbeat';
import {
  getProviderFactory,
  initializeLLMCli,
  type ILLMProvider,
  type LLMProviderType,
  type TaskCharacteristics,
} from './providers';

// Agent configuration
const AGENT_ID = process.env.AGENT_ID || `agent-${uuid().slice(0, 8)}`;
const WORKTREE_BASE = process.env.WORKTREE_BASE || '/worktrees';

// Provider configuration
const AGENT_PROVIDER = (process.env.AGENT_PROVIDER || 'claude-code') as LLMProviderType;

/**
 * Agent state
 */
type AgentState = 'idle' | 'busy' | 'stopping' | 'error';

class AgentWorker {
  private redis = getRedisClient();
  private heartbeat: Heartbeat;
  private providerFactory = getProviderFactory();
  private currentProvider: ILLMProvider | null = null;
  private currentTaskId: string | null = null;
  private state: AgentState = 'idle';
  private shutdownRequested = false;
  private assignedProvider: LLMProviderType = AGENT_PROVIDER;

  constructor() {
    this.heartbeat = new Heartbeat(AGENT_ID, this.redis, () => this.getStatus());
  }

  /**
   * Start the agent worker
   */
  async start(): Promise<void> {
    console.log(`[Agent ${AGENT_ID}] Starting...`);
    console.log(`[Agent ${AGENT_ID}] Provider: ${this.assignedProvider}`);

    // Initialize LLM CLI if using non-Claude-Code providers
    if (this.assignedProvider !== 'claude-code') {
      await initializeLLMCli();
    }

    // Connect to Redis
    await this.redis.connect();

    // Register with orchestrator
    await this.register();

    // Subscribe to orchestrator channels
    await this.redis.subscribeToOrchestrator((message) =>
      this.handleOrchestratorMessage(message)
    );

    // Start heartbeat
    this.heartbeat.start();

    // Handle shutdown signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    console.log(`[Agent ${AGENT_ID}] Ready and listening for tasks`);
  }

  /**
   * Register with the orchestrator
   */
  private async register(): Promise<void> {
    const availableProviders = this.providerFactory.getAvailableProviders();

    await this.redis.publish(AGENT_CHANNELS.AGENT_REGISTER, {
      type: 'agent:register',
      agentId: AGENT_ID,
      capabilities: {
        maxConcurrentTasks: 1,
        supportedLanguages: ['typescript', 'javascript', 'python', 'go'],
        hasWorktree: true,
        worktreePath: `${WORKTREE_BASE}/${AGENT_ID}`,
        // Multi-LLM capabilities
        llmProvider: this.assignedProvider,
        availableProviders,
        supportsToolUse: this.assignedProvider === 'claude-code',
      },
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        memory: Math.round(os.totalmem() / 1024 / 1024),
        cpus: os.cpus().length,
      },
      timestamp: new Date().toISOString(),
    });

    // Add to active agents
    await this.redis.addActiveAgent(AGENT_ID);

    console.log(`[Agent ${AGENT_ID}] Registered with orchestrator`);
    console.log(`[Agent ${AGENT_ID}] Available providers: ${availableProviders.join(', ')}`);
  }

  /**
   * Handle messages from orchestrator
   */
  private async handleOrchestratorMessage(
    message: OrchestratorMessage
  ): Promise<void> {
    switch (message.type) {
      case 'task:dispatch':
        await this.handleTaskDispatch(message as TaskDispatchMessage);
        break;

      case 'control:stop':
        await this.handleStop(message as ControlStopMessage);
        break;

      case 'control:kill':
        await this.handleKill(message as ControlKillMessage);
        break;
    }
  }

  /**
   * Handle task dispatch
   */
  private async handleTaskDispatch(message: TaskDispatchMessage): Promise<void> {
    // Check if this task is for us
    if (message.targetAgentId && message.targetAgentId !== AGENT_ID) {
      return; // Task is for a different agent
    }

    // Check if we're available
    if (this.state !== 'idle') {
      console.log(`[Agent ${AGENT_ID}] Busy, ignoring task ${message.taskId}`);
      return;
    }

    // Try to acquire lock (prevents race conditions)
    const locked = await this.redis.acquireAgentLock(AGENT_ID);
    if (!locked) {
      console.log(`[Agent ${AGENT_ID}] Failed to acquire lock, another agent got it`);
      return;
    }

    try {
      await this.runTask(message);
    } finally {
      await this.redis.releaseAgentLock(AGENT_ID);
    }
  }

  /**
   * Run a task
   */
  private async runTask(message: TaskDispatchMessage): Promise<void> {
    const { taskId, task } = message;

    console.log(`[Agent ${AGENT_ID}] Starting task ${taskId}: ${task.description}`);

    this.state = 'busy';
    this.currentTaskId = taskId;

    const startTime = new Date();

    // Update status
    await this.publishStatus('busy', `Starting task: ${task.description}`);

    try {
      // Determine task characteristics for LLM selection
      const characteristics = this.analyzeTask(task);

      // Create provider based on task characteristics
      // If agent has a fixed provider, use that; otherwise let factory decide
      this.currentProvider = this.assignedProvider === 'claude-code'
        ? await this.providerFactory.createProvider(AGENT_ID, taskId, this.redis, characteristics)
        : await this.providerFactory.createProviderByType(
            this.assignedProvider,
            AGENT_ID,
            taskId,
            this.redis
          );

      console.log(`[Agent ${AGENT_ID}] Using provider: ${this.currentProvider.name}`);

      // Run the session
      const result = await this.currentProvider.run({
        prompt: task.description,
        context: task.context,
        workingDirectory: task.worktreePath,
        taskCharacteristics: characteristics,
      });

      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      // Publish result
      await this.redis.publish(AGENT_CHANNELS.TASK_RESULT, {
        type: 'task:result',
        taskId,
        agentId: AGENT_ID,
        status: result.success ? 'completed' : 'failed',
        success: result.success,
        claims: {
          commitsCreated: result.commitsCreated,
          filesModified: result.filesModified,
          testsRun: result.testsRun,
          testsPassed: result.testsPassed,
        },
        summary: result.summary,
        response: result.response, // Include raw response for non-agentic providers
        tokensUsed: result.tokensUsed,
        cost: result.cost,
        provider: this.currentProvider.type,
        error: result.error,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMs,
      });

      console.log(
        `[Agent ${AGENT_ID}] Task ${taskId} ${result.success ? 'completed' : 'failed'} in ${durationMs}ms`
      );
    } catch (error) {
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();

      // Publish error result
      await this.redis.publish(AGENT_CHANNELS.TASK_RESULT, {
        type: 'task:result',
        taskId,
        agentId: AGENT_ID,
        status: 'failed',
        success: false,
        claims: {
          commitsCreated: 0,
          filesModified: [],
          testsRun: false,
          testsPassed: false,
        },
        summary: 'Task failed with exception',
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true,
        },
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMs,
      });

      console.error(`[Agent ${AGENT_ID}] Task ${taskId} error:`, error);
    } finally {
      this.currentProvider = null;
      this.currentTaskId = null;
      this.state = 'idle';

      await this.publishStatus('idle', 'Ready for next task');
    }
  }

  /**
   * Analyze task to determine characteristics for LLM selection
   */
  private analyzeTask(task: TaskDispatchMessage['task']): TaskCharacteristics {
    const description = task.description.toLowerCase();

    // Determine task type
    let type: TaskCharacteristics['type'] = 'coding';
    if (description.includes('review') || description.includes('check')) {
      type = 'review';
    } else if (description.includes('plan') || description.includes('design')) {
      type = 'planning';
    } else if (description.includes('analyze') || description.includes('explain')) {
      type = 'analysis';
    } else if (description.includes('chat') || description.includes('question')) {
      type = 'chat';
    }

    // Determine complexity
    let complexity: TaskCharacteristics['complexity'] = 'medium';
    const wordCount = description.split(/\s+/).length;
    if (wordCount < 10) {
      complexity = 'simple';
    } else if (wordCount > 50 || description.includes('complex') || description.includes('refactor')) {
      complexity = 'complex';
    }

    // Determine if tools are required
    const requiresTools =
      description.includes('fix') ||
      description.includes('create') ||
      description.includes('update') ||
      description.includes('delete') ||
      description.includes('modify') ||
      description.includes('implement') ||
      description.includes('add') ||
      description.includes('remove') ||
      description.includes('change') ||
      description.includes('refactor');

    return {
      type,
      complexity,
      requiresTools,
      priority: 'normal',
    };
  }

  /**
   * Handle stop command
   */
  private async handleStop(message: ControlStopMessage): Promise<void> {
    if (message.agentId !== AGENT_ID) return;

    console.log(`[Agent ${AGENT_ID}] Stop requested: ${message.reason}`);

    this.state = 'stopping';
    await this.publishStatus('stopping', message.reason);

    if (this.currentProvider) {
      await this.currentProvider.abort();
    }

    this.state = 'idle';
    await this.publishStatus('idle', 'Stopped');
  }

  /**
   * Handle kill command
   */
  private async handleKill(message: ControlKillMessage): Promise<void> {
    if (message.agentId !== AGENT_ID) return;

    console.log(`[Agent ${AGENT_ID}] Kill requested: ${message.reason}`);

    await this.shutdown(message.reason);
  }

  /**
   * Publish status update
   */
  private async publishStatus(status: AgentState, reason: string): Promise<void> {
    await this.redis.publish(AGENT_CHANNELS.AGENT_STATUS, {
      type: 'agent:status',
      agentId: AGENT_ID,
      previousStatus: this.state,
      currentStatus: status,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current status for heartbeat
   */
  private getStatus(): {
    status: AgentState;
    provider: LLMProviderType;
    currentTask?: { taskId: string; progress: number; currentStep: string };
  } {
    return {
      status: this.state,
      provider: this.assignedProvider,
      currentTask: this.currentTaskId
        ? {
            taskId: this.currentTaskId,
            progress: this.currentProvider?.getProgress() || 0,
            currentStep: this.currentProvider?.getCurrentStep() || 'Running',
          }
        : undefined,
    };
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(reason: string): Promise<void> {
    if (this.shutdownRequested) return;
    this.shutdownRequested = true;

    console.log(`[Agent ${AGENT_ID}] Shutting down: ${reason}`);

    // Stop heartbeat
    this.heartbeat.stop();

    // Abort current provider if any
    if (this.currentProvider) {
      await this.currentProvider.abort();
    }

    // Deregister
    await this.redis.publish(AGENT_CHANNELS.AGENT_DEREGISTER, {
      type: 'agent:deregister',
      agentId: AGENT_ID,
      reason,
      timestamp: new Date().toISOString(),
    });

    await this.redis.removeActiveAgent(AGENT_ID);

    // Disconnect
    await this.redis.disconnect();

    console.log(`[Agent ${AGENT_ID}] Shutdown complete`);
    process.exit(0);
  }
}

// Start the worker
const worker = new AgentWorker();
worker.start().catch((err) => {
  console.error('Failed to start agent worker:', err);
  process.exit(1);
});
