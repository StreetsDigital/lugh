/**
 * Pool Coordinator
 *
 * Main coordination logic for the PostgreSQL-based agent pool.
 * Handles task distribution, result collection, and agent lifecycle management.
 */

import { Pool } from 'pg';
import { PgPubSub } from './pubsub.js';
import { AgentRegistry } from './agent-registry.js';
import { TaskQueue } from './task-queue.js';
import type {
  TaskRequest,
  TaskHandle,
  PoolStatus,
  PoolTask,
  HeartbeatMessage,
} from './types.js';

export interface PoolCoordinatorConfig {
  /** Maximum number of agents in the pool */
  poolSize: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval: number;
  /** Seconds before marking agent as stale */
  staleThreshold: number;
  /** Seconds before reassigning stuck tasks */
  taskTimeout: number;
}

export class PoolCoordinator {
  private pubsub: PgPubSub;
  private registry: AgentRegistry;
  private queue: TaskQueue;
  private isInitialized = false;
  private cleanupInterval?: NodeJS.Timeout;
  private config: PoolCoordinatorConfig;

  constructor(
    private pool: Pool,
    config?: Partial<PoolCoordinatorConfig>
  ) {
    this.pubsub = new PgPubSub(pool);
    this.registry = new AgentRegistry(pool);
    this.queue = new TaskQueue(pool);

    // Default configuration
    this.config = {
      poolSize: parseInt(process.env.AGENT_POOL_SIZE || '4', 10),
      heartbeatInterval: parseInt(process.env.AGENT_HEARTBEAT_INTERVAL || '30000', 10),
      staleThreshold: parseInt(process.env.AGENT_STALE_THRESHOLD || '120', 10),
      taskTimeout: parseInt(process.env.AGENT_TASK_TIMEOUT || '300', 10),
      ...config,
    };
  }

  /**
   * Initialize the pool coordinator
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[PoolCoordinator] Already initialized');
      return;
    }

    console.log('[PoolCoordinator] Initializing...');

    // Subscribe to heartbeat messages
    await this.pubsub.subscribe('agent_heartbeat', (payload) => {
      this.handleHeartbeat(payload as HeartbeatMessage);
    });

    // Start background cleanup tasks
    this.startCleanupTasks();

    this.isInitialized = true;
    console.log(
      `[PoolCoordinator] Initialized (poolSize: ${this.config.poolSize}, ` +
      `staleThreshold: ${this.config.staleThreshold}s)`
    );
  }

  /**
   * Submit a task to the pool
   *
   * Returns a task handle that can be used to track status and wait for results
   */
  async submitTask(request: TaskRequest): Promise<TaskHandle> {
    if (!this.isInitialized) {
      throw new Error('[PoolCoordinator] Not initialized. Call initialize() first.');
    }

    try {
      // Enqueue the task
      const taskId = await this.queue.enqueue(request);

      // Notify agents that a task is available
      await this.pubsub.publish('agent_task_available', {
        taskId,
        taskType: request.taskType,
        priority: request.priority || 5,
      });

      console.log(`[PoolCoordinator] Submitted task ${taskId}`);

      return {
        taskId,
        status: 'queued',
      };
    } catch (error) {
      console.error('[PoolCoordinator] Failed to submit task:', error);
      throw error;
    }
  }

  /**
   * Wait for task completion and return the result
   *
   * Polls the database for task completion. For long-running tasks,
   * consider using result streaming instead.
   */
  async waitForResult(
    taskId: string,
    timeoutMs: number = 300000 // 5 minutes default
  ): Promise<PoolTask> {
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every second

    while (Date.now() - startTime < timeoutMs) {
      const task = await this.queue.getTask(taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status === 'completed') {
        return task;
      }

      if (task.status === 'failed') {
        throw new Error(`Task ${taskId} failed: ${task.error}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Task ${taskId} timed out after ${timeoutMs}ms`);
  }

  /**
   * Stop a running task
   */
  async stopTask(taskId: string): Promise<void> {
    const task = await this.queue.getTask(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.assignedAgentId) {
      // Notify agent to stop
      await this.pubsub.publish(`agent_stop_${task.assignedAgentId}`, {
        taskId,
      });
    }

    // Cancel the task
    await this.queue.cancel(taskId, 'Stopped by coordinator');

    console.log(`[PoolCoordinator] Stopped task ${taskId}`);
  }

  /**
   * Get current pool status
   */
  async getPoolStatus(): Promise<PoolStatus> {
    const agentCounts = await this.registry.getStatusCounts();
    const taskStats = await this.queue.getStats();

    return {
      totalAgents: agentCounts.total,
      idleAgents: agentCounts.idle,
      busyAgents: agentCounts.busy,
      offlineAgents: agentCounts.offline,
      queuedTasks: taskStats.queued,
      runningTasks: taskStats.running,
      completedTasks: taskStats.completed,
      failedTasks: taskStats.failed,
    };
  }

  /**
   * Handle heartbeat message from an agent
   */
  private async handleHeartbeat(message: HeartbeatMessage): Promise<void> {
    try {
      await this.registry.heartbeat(message.agentId);
    } catch (error) {
      console.error(
        `[PoolCoordinator] Failed to process heartbeat from ${message.agentId}:`,
        error
      );
    }
  }

  /**
   * Start background cleanup tasks
   */
  private startCleanupTasks(): void {
    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(async () => {
      try {
        // Prune stale agents
        await this.registry.pruneStale(this.config.staleThreshold);

        // Reassign stuck tasks
        await this.queue.reassignStuckTasks(this.config.taskTimeout);
      } catch (error) {
        console.error('[PoolCoordinator] Cleanup task error:', error);
      }
    }, 30000);
  }

  /**
   * Shutdown the pool coordinator
   */
  async shutdown(): Promise<void> {
    console.log('[PoolCoordinator] Shutting down...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    await this.pubsub.shutdown();

    this.isInitialized = false;
    console.log('[PoolCoordinator] Shutdown complete');
  }

  /**
   * Get the PubSub instance (for agent workers)
   */
  getPubSub(): PgPubSub {
    return this.pubsub;
  }

  /**
   * Get the AgentRegistry instance
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * Get the TaskQueue instance
   */
  getQueue(): TaskQueue {
    return this.queue;
  }
}
