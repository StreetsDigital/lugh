/**
 * Unit tests for Task Queue
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Pool } from 'pg';
import { TaskQueue } from './task-queue';
import type { TaskRequest } from './types';

describe('TaskQueue', () => {
  let pool: Pool;
  let queue: TaskQueue;

  beforeEach(async () => {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/lugh_test',
    });
    queue = new TaskQueue(pool);

    // Clean up test data
    await pool.query('DELETE FROM pool_task_results');
    await pool.query('DELETE FROM pool_tasks');
  });

  afterEach(async () => {
    await pool.query('DELETE FROM pool_task_results');
    await pool.query('DELETE FROM pool_tasks');
    await pool.end();
  });

  describe('enqueue', () => {
    test('should enqueue a task', async () => {
      const request: TaskRequest = {
        conversationId: 'conv-1',
        taskType: 'code',
        priority: 5,
        payload: { instruction: 'write a function' },
      };

      const taskId = await queue.enqueue(request);

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');

      const task = await queue.getTask(taskId);
      expect(task?.conversationId).toBe('conv-1');
      expect(task?.taskType).toBe('code');
      expect(task?.status).toBe('queued');
    });

    test('should use default priority if not specified', async () => {
      const request: TaskRequest = {
        conversationId: 'conv-2',
        taskType: 'review',
        payload: {},
      };

      const taskId = await queue.enqueue(request);
      const task = await queue.getTask(taskId);

      expect(task?.priority).toBe(5); // Default priority
    });
  });

  describe('dequeue', () => {
    test('should dequeue highest priority task', async () => {
      // Enqueue multiple tasks with different priorities
      await queue.enqueue({
        conversationId: 'conv-3',
        taskType: 'code',
        priority: 5,
        payload: {},
      });

      await queue.enqueue({
        conversationId: 'conv-4',
        taskType: 'code',
        priority: 1, // Highest priority
        payload: {},
      });

      await queue.enqueue({
        conversationId: 'conv-5',
        taskType: 'code',
        priority: 10,
        payload: {},
      });

      const task = await queue.dequeue('agent-1');

      expect(task?.priority).toBe(1); // Should get highest priority
      expect(task?.conversationId).toBe('conv-4');
      expect(task?.status).toBe('assigned');
      expect(task?.assignedAgentId).toBe('agent-1');
    });

    test('should return null when no tasks available', async () => {
      const task = await queue.dequeue('agent-2');
      expect(task).toBeNull();
    });

    test('should handle concurrent dequeue correctly (no double assignment)', async () => {
      await queue.enqueue({
        conversationId: 'conv-concurrent',
        taskType: 'code',
        payload: {},
      });

      // Simulate two agents trying to dequeue simultaneously
      const [task1, task2] = await Promise.all([
        queue.dequeue('agent-A'),
        queue.dequeue('agent-B'),
      ]);

      // One should get the task, one should get null
      const results = [task1, task2];
      const assigned = results.filter((t) => t !== null);
      const nulls = results.filter((t) => t === null);

      expect(assigned.length).toBe(1);
      expect(nulls.length).toBe(1);
    });
  });

  describe('markRunning', () => {
    test('should mark task as running', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'conv-6',
        taskType: 'test',
        payload: {},
      });

      await queue.dequeue('agent-3'); // Assign it
      await queue.markRunning(taskId);

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('running');
    });
  });

  describe('complete', () => {
    test('should mark task as completed with result', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'conv-7',
        taskType: 'code',
        payload: {},
      });

      await queue.dequeue('agent-4');

      const result = { success: true, output: 'Task completed' };
      await queue.complete(taskId, result);

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.result).toEqual(result);
      expect(task?.completedAt).toBeDefined();
    });
  });

  describe('fail', () => {
    test('should mark task as failed with error message', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'conv-8',
        taskType: 'code',
        payload: {},
      });

      await queue.dequeue('agent-5');

      await queue.fail(taskId, 'Task execution failed');

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('Task execution failed');
      expect(task?.completedAt).toBeDefined();
    });
  });

  describe('addResult and getResults', () => {
    test('should stream results for a task', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'conv-9',
        taskType: 'code',
        payload: {},
      });

      await queue.addResult(taskId, 'chunk', { text: 'Processing...' });
      await queue.addResult(taskId, 'chunk', { text: 'Almost done...' });
      await queue.addResult(taskId, 'complete', { text: 'Done!' });

      const results = await queue.getResults(taskId);

      expect(results.length).toBe(3);
      expect(results[0].resultType).toBe('chunk');
      expect(results[1].resultType).toBe('chunk');
      expect(results[2].resultType).toBe('complete');
    });

    test('should return results in chronological order', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'conv-10',
        taskType: 'code',
        payload: {},
      });

      await queue.addResult(taskId, 'chunk', { sequence: 1 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await queue.addResult(taskId, 'chunk', { sequence: 2 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await queue.addResult(taskId, 'chunk', { sequence: 3 });

      const results = await queue.getResults(taskId);

      expect(results[0].content).toEqual({ sequence: 1 });
      expect(results[1].content).toEqual({ sequence: 2 });
      expect(results[2].content).toEqual({ sequence: 3 });
    });
  });

  describe('getStats', () => {
    test('should return accurate queue statistics', async () => {
      // Create tasks with different statuses
      const task1 = await queue.enqueue({
        conversationId: 'stat-1',
        taskType: 'code',
        payload: {},
      });

      const task2 = await queue.enqueue({
        conversationId: 'stat-2',
        taskType: 'code',
        payload: {},
      });

      const task3 = await queue.enqueue({
        conversationId: 'stat-3',
        taskType: 'code',
        payload: {},
      });

      // Leave task1 queued
      // Assign task2
      await queue.dequeue('agent-6');
      // Complete task3
      await queue.dequeue('agent-7');
      await queue.complete(task3, {});

      const stats = await queue.getStats();

      expect(stats.queued).toBe(1);
      expect(stats.assigned).toBe(2);
      expect(stats.completed).toBe(1);
    });
  });

  describe('reassignStuckTasks', () => {
    test('should reassign tasks stuck in running state', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'stuck-1',
        taskType: 'code',
        payload: {},
      });

      await queue.dequeue('agent-stuck');
      await queue.markRunning(taskId);

      // Manually set old started_at timestamp
      await pool.query(
        `UPDATE pool_tasks SET started_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
        [taskId]
      );

      const reassigned = await queue.reassignStuckTasks(300); // 5 minute threshold

      expect(reassigned).toBe(1);

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('queued');
      expect(task?.assignedAgentId).toBeNull();
    });

    test('should not reassign recently started tasks', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'not-stuck',
        taskType: 'code',
        payload: {},
      });

      await queue.dequeue('agent-active');
      await queue.markRunning(taskId);

      const reassigned = await queue.reassignStuckTasks(300);

      expect(reassigned).toBe(0);

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('running');
      expect(task?.assignedAgentId).toBe('agent-active');
    });
  });

  describe('cancel', () => {
    test('should cancel a queued task', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'cancel-1',
        taskType: 'code',
        payload: {},
      });

      await queue.cancel(taskId, 'User cancelled');

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('failed');
      expect(task?.error).toBe('User cancelled');
    });

    test('should not cancel completed tasks', async () => {
      const taskId = await queue.enqueue({
        conversationId: 'cancel-2',
        taskType: 'code',
        payload: {},
      });

      await queue.dequeue('agent-8');
      await queue.complete(taskId, {});

      await queue.cancel(taskId);

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('completed'); // Should still be completed
    });
  });
});
