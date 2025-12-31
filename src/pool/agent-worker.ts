/**
 * Agent Worker (PostgreSQL-based)
 *
 * Simplified agent worker that uses PostgreSQL pub/sub instead of Redis.
 * Listens for task assignments and executes them using Claude Code.
 */

import { v4 as uuid } from 'uuid';
import { Pool } from 'pg';
import { PgPubSub } from './pubsub.js';
import { AgentRegistry } from './agent-registry.js';
import { TaskQueue } from './task-queue.js';
import type { PoolTask, HeartbeatMessage } from './types.js';

export interface AgentWorkerConfig {
  /** Unique agent ID */
  agentId?: string;
  /** Agent capabilities */
  capabilities?: string[];
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

export class AgentWorker {
  private agentId: string;
  private capabilities: string[];
  private heartbeatInterval: number;
  private pubsub: PgPubSub;
  private registry: AgentRegistry;
  private queue: TaskQueue;
  private currentTask: PoolTask | null = null;
  private isRunning = false;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    pool: Pool,
    config?: AgentWorkerConfig
  ) {
    this.agentId = config?.agentId || `agent-${uuid().slice(0, 8)}`;
    this.capabilities = config?.capabilities || ['general'];
    this.heartbeatInterval = config?.heartbeatInterval || 30000; // 30 seconds

    this.pubsub = new PgPubSub(pool);
    this.registry = new AgentRegistry(pool);
    this.queue = new TaskQueue(pool);
  }

  /**
   * Start the agent worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn(`[Agent ${this.agentId}] Already running`);
      return;
    }

    console.log(`[Agent ${this.agentId}] Starting...`);

    try {
      // Register with the pool
      await this.registry.register(this.agentId, this.capabilities);

      // Subscribe to task assignment channel
      await this.pubsub.subscribe(
        `agent_task_assigned_${this.agentId}`,
        (task) => this.handleTaskAssignment(task as PoolTask)
      );

      // Subscribe to task availability notifications
      await this.pubsub.subscribe('agent_task_available', () =>
        this.checkForWork()
      );

      // Subscribe to stop signals
      await this.pubsub.subscribe(`agent_stop_${this.agentId}`, (payload) =>
        this.handleStopSignal(payload as { taskId: string })
      );

      // Start heartbeat
      this.startHeartbeat();

      // Handle shutdown signals
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));

      this.isRunning = true;
      console.log(`[Agent ${this.agentId}] Ready and listening for tasks`);

      // Check for work immediately
      await this.checkForWork();
    } catch (error) {
      console.error(`[Agent ${this.agentId}] Failed to start:`, error);
      throw error;
    }
  }

  /**
   * Check if there's work available and claim it
   */
  private async checkForWork(): Promise<void> {
    if (this.currentTask) {
      // Already working on a task
      return;
    }

    try {
      // Try to dequeue a task
      const task = await this.queue.dequeue(this.agentId);

      if (task) {
        await this.handleTaskAssignment(task);
      }
    } catch (error) {
      console.error(`[Agent ${this.agentId}] Error checking for work:`, error);
    }
  }

  /**
   * Handle task assignment
   */
  private async handleTaskAssignment(task: PoolTask): Promise<void> {
    console.log(`[Agent ${this.agentId}] Received task ${task.id}`);

    this.currentTask = task;

    try {
      // Update status to busy
      await this.registry.setStatus(this.agentId, 'busy', task.id);

      // Mark task as running
      await this.queue.markRunning(task.id);

      // Execute the task
      const result = await this.executeTask(task);

      // Complete the task
      await this.queue.complete(task.id, result);

      console.log(`[Agent ${this.agentId}] Completed task ${task.id}`);
    } catch (error) {
      console.error(`[Agent ${this.agentId}] Task ${task.id} failed:`, error);

      // Mark task as failed
      await this.queue.fail(
        task.id,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      // Clear current task and return to idle
      this.currentTask = null;
      await this.registry.setStatus(this.agentId, 'idle');

      // Send heartbeat with updated status
      await this.sendHeartbeat();

      // Check for more work
      await this.checkForWork();
    }
  }

  /**
   * Execute a task
   *
   * This is a placeholder - in the full implementation, this would:
   * 1. Spawn a Claude Code session
   * 2. Send the task payload as a prompt
   * 3. Stream results back via queue.addResult()
   * 4. Return the final result
   */
  private async executeTask(
    task: PoolTask
  ): Promise<Record<string, unknown>> {
    console.log(
      `[Agent ${this.agentId}] Executing task type: ${task.taskType}`
    );

    // TODO: Implement actual task execution with Claude Code
    // For now, simulate work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      status: 'success',
      message: `Task ${task.id} completed by ${this.agentId}`,
      taskType: task.taskType,
      executedAt: new Date().toISOString(),
    };
  }

  /**
   * Handle stop signal for current task
   */
  private async handleStopSignal(payload: {
    taskId: string;
  }): Promise<void> {
    if (this.currentTask?.id === payload.taskId) {
      console.warn(
        `[Agent ${this.agentId}] Received stop signal for task ${payload.taskId}`
      );

      // TODO: Implement graceful task cancellation
      // For now, just log it
    }
  }

  /**
   * Start sending heartbeats
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.heartbeatInterval);
  }

  /**
   * Send a heartbeat message
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await this.registry.heartbeat(this.agentId);

      const message: HeartbeatMessage = {
        agentId: this.agentId,
        status: this.currentTask ? 'busy' : 'idle',
        timestamp: Date.now(),
      };

      await this.pubsub.publish('agent_heartbeat', message);
    } catch (error) {
      console.error(`[Agent ${this.agentId}] Heartbeat failed:`, error);
    }
  }

  /**
   * Shutdown the agent worker
   */
  async shutdown(signal?: string): Promise<void> {
    console.log(
      `[Agent ${this.agentId}] Shutting down${signal ? ` (${signal})` : ''}...`
    );

    this.isRunning = false;

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Mark as offline
    await this.registry.unregister(this.agentId);

    // Shutdown pub/sub
    await this.pubsub.shutdown();

    console.log(`[Agent ${this.agentId}] Shutdown complete`);
    process.exit(0);
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Get current status
   */
  getStatus(): {
    agentId: string;
    isRunning: boolean;
    currentTask: string | null;
    capabilities: string[];
  } {
    return {
      agentId: this.agentId,
      isRunning: this.isRunning,
      currentTask: this.currentTask?.id || null,
      capabilities: this.capabilities,
    };
  }
}
