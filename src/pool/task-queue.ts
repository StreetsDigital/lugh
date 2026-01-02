/**
 * Task Queue
 *
 * Priority-ordered task queue backed by PostgreSQL.
 * Handles task enqueueing, assignment, completion, and failure tracking.
 */

import { Pool } from 'pg';
import type { PoolTask, TaskRequest, TaskStatus, TaskResult, ResultType } from './types.js';

export class TaskQueue {
  constructor(private pool: Pool) {}

  /**
   * Enqueue a new task
   *
   * Returns the task ID
   */
  async enqueue(request: TaskRequest): Promise<string> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `
        INSERT INTO pool_tasks (
          conversation_id,
          task_type,
          priority,
          status,
          payload
        )
        VALUES ($1, $2, $3, 'queued', $4)
        RETURNING id
        `,
        [
          request.conversationId,
          request.taskType,
          request.priority || 5,
          JSON.stringify(request.payload),
        ]
      );

      const taskId = result.rows[0].id;
      console.log(
        `[TaskQueue] Enqueued task ${taskId} (type: ${request.taskType}, priority: ${request.priority || 5})`
      );

      return taskId;
    } catch (error) {
      console.error('[TaskQueue] Failed to enqueue task:', error);
      throw error;
    }
  }

  /**
   * Dequeue the next available task for an agent
   *
   * Assigns the task to the agent atomically and returns it.
   * Returns null if no tasks available.
   */
  async dequeue(agentId: string): Promise<PoolTask | null> {
    try {
      // Use FOR UPDATE SKIP LOCKED for optimal concurrency
      const result = await this.pool.query<PoolTask>(
        `
        UPDATE pool_tasks
        SET
          status = 'assigned',
          assigned_agent_id = $1,
          started_at = NOW()
        WHERE id = (
          SELECT id
          FROM pool_tasks
          WHERE status = 'queued'
          ORDER BY priority ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING
          id,
          conversation_id as "conversationId",
          task_type as "taskType",
          priority,
          status,
          payload,
          result,
          assigned_agent_id as "assignedAgentId",
          created_at as "createdAt",
          started_at as "startedAt",
          completed_at as "completedAt",
          error
        `,
        [agentId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const task = result.rows[0];

      // Parse JSON fields
      task.payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload;

      if (task.result) {
        task.result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result;
      }

      console.log(`[TaskQueue] Dequeued task ${task.id} for agent ${agentId}`);

      return task;
    } catch (error) {
      console.error(`[TaskQueue] Failed to dequeue task for agent '${agentId}':`, error);
      throw error;
    }
  }

  /**
   * Mark a task as running (agent started work)
   */
  async markRunning(taskId: string): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE pool_tasks
        SET status = 'running'
        WHERE id = $1
        `,
        [taskId]
      );

      console.log(`[TaskQueue] Task ${taskId} marked as running`);
    } catch (error) {
      console.error(`[TaskQueue] Failed to mark task '${taskId}' as running:`, error);
      throw error;
    }
  }

  /**
   * Complete a task with a result
   */
  async complete(taskId: string, result: Record<string, unknown>): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE pool_tasks
        SET
          status = 'completed',
          result = $1,
          completed_at = NOW()
        WHERE id = $2
        `,
        [JSON.stringify(result), taskId]
      );

      console.log(`[TaskQueue] Task ${taskId} completed`);
    } catch (error) {
      console.error(`[TaskQueue] Failed to complete task '${taskId}':`, error);
      throw error;
    }
  }

  /**
   * Mark a task as failed with error message
   */
  async fail(taskId: string, error: string): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE pool_tasks
        SET
          status = 'failed',
          error = $1,
          completed_at = NOW()
        WHERE id = $2
        `,
        [error, taskId]
      );

      console.error(`[TaskQueue] Task ${taskId} failed: ${error}`);
    } catch (err) {
      console.error(`[TaskQueue] Failed to mark task '${taskId}' as failed:`, err);
      throw err;
    }
  }

  /**
   * Get task status and details
   */
  async getTask(taskId: string): Promise<PoolTask | null> {
    try {
      const result = await this.pool.query<PoolTask>(
        `
        SELECT
          id,
          conversation_id as "conversationId",
          task_type as "taskType",
          priority,
          status,
          payload,
          result,
          assigned_agent_id as "assignedAgentId",
          created_at as "createdAt",
          started_at as "startedAt",
          completed_at as "completedAt",
          error
        FROM pool_tasks
        WHERE id = $1
        `,
        [taskId]
      );

      if (result.rows.length === 0) return null;

      const task = result.rows[0];

      // Parse JSON fields
      task.payload = typeof task.payload === 'string' ? JSON.parse(task.payload) : task.payload;

      if (task.result) {
        task.result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result;
      }

      return task;
    } catch (error) {
      console.error(`[TaskQueue] Failed to get task '${taskId}':`, error);
      throw error;
    }
  }

  /**
   * Add a result chunk to a task (for streaming results)
   */
  async addResult(
    taskId: string,
    resultType: ResultType,
    content: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO pool_task_results (task_id, result_type, content)
        VALUES ($1, $2, $3)
        `,
        [taskId, resultType, JSON.stringify(content)]
      );
    } catch (error) {
      console.error(`[TaskQueue] Failed to add result to task '${taskId}':`, error);
      throw error;
    }
  }

  /**
   * Get all results for a task (in chronological order)
   */
  async getResults(taskId: string): Promise<TaskResult[]> {
    try {
      const result = await this.pool.query<TaskResult>(
        `
        SELECT
          id,
          task_id as "taskId",
          result_type as "resultType",
          content,
          created_at as "createdAt"
        FROM pool_task_results
        WHERE task_id = $1
        ORDER BY created_at ASC
        `,
        [taskId]
      );

      return result.rows.map(row => ({
        ...row,
        content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
      }));
    } catch (error) {
      console.error(`[TaskQueue] Failed to get results for task '${taskId}':`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queued: number;
    assigned: number;
    running: number;
    completed: number;
    failed: number;
  }> {
    try {
      const result = await this.pool.query<{
        status: TaskStatus;
        count: string;
      }>(
        `
        SELECT status, COUNT(*)::text as count
        FROM pool_tasks
        GROUP BY status
        `
      );

      const stats = {
        queued: 0,
        assigned: 0,
        running: 0,
        completed: 0,
        failed: 0,
      };

      for (const row of result.rows) {
        const count = parseInt(row.count, 10);
        stats[row.status] = count;
      }

      return stats;
    } catch (error) {
      console.error('[TaskQueue] Failed to get queue stats:', error);
      throw error;
    }
  }

  /**
   * Reassign stuck tasks (running for too long without completion)
   */
  async reassignStuckTasks(maxRuntimeSeconds: number = 300): Promise<number> {
    try {
      const result = await this.pool.query(
        `
        UPDATE pool_tasks
        SET
          status = 'queued',
          assigned_agent_id = NULL,
          started_at = NULL
        WHERE status IN ('assigned', 'running')
          AND started_at < NOW() - INTERVAL '1 second' * $1
        `,
        [maxRuntimeSeconds]
      );

      const count = result.rowCount || 0;

      if (count > 0) {
        console.warn(`[TaskQueue] Reassigned ${count} stuck tasks`);
      }

      return count;
    } catch (error) {
      console.error('[TaskQueue] Failed to reassign stuck tasks:', error);
      throw error;
    }
  }

  /**
   * Cancel a task (mark as failed with cancellation message)
   */
  async cancel(taskId: string, reason: string = 'Cancelled by user'): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE pool_tasks
        SET
          status = 'failed',
          error = $1,
          completed_at = NOW()
        WHERE id = $2 AND status IN ('queued', 'assigned', 'running')
        `,
        [reason, taskId]
      );

      console.log(`[TaskQueue] Task ${taskId} cancelled: ${reason}`);
    } catch (error) {
      console.error(`[TaskQueue] Failed to cancel task '${taskId}':`, error);
      throw error;
    }
  }
}
