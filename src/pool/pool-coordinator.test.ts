/**
 * Integration tests for Pool Coordinator
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Pool } from 'pg';
import { PoolCoordinator } from './pool-coordinator';
import type { TaskRequest } from './types';

describe('PoolCoordinator', () => {
  let pool: Pool;
  let coordinator: PoolCoordinator;

  beforeEach(async () => {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/lugh_test',
    });

    coordinator = new PoolCoordinator(pool, {
      poolSize: 4,
      heartbeatInterval: 30000,
      staleThreshold: 120,
      taskTimeout: 300,
    });

    // Clean up test data
    await pool.query('DELETE FROM pool_task_results');
    await pool.query('DELETE FROM pool_tasks');
    await pool.query('DELETE FROM agent_pool');

    await coordinator.initialize();
  });

  afterEach(async () => {
    await coordinator.shutdown();
    await pool.query('DELETE FROM pool_task_results');
    await pool.query('DELETE FROM pool_tasks');
    await pool.query('DELETE FROM agent_pool');
    await pool.end();
  });

  describe('initialize', () => {
    test('should initialize successfully', async () => {
      const newCoordinator = new PoolCoordinator(pool);
      await newCoordinator.initialize();

      await newCoordinator.shutdown();
    });

    test('should not allow double initialization', async () => {
      await coordinator.initialize(); // Already initialized in beforeEach
      // Should warn but not throw
    });
  });

  describe('submitTask', () => {
    test('should submit a task and return handle', async () => {
      const request: TaskRequest = {
        conversationId: 'test-conv',
        taskType: 'code',
        priority: 5,
        payload: { instruction: 'test task' },
      };

      const handle = await coordinator.submitTask(request);

      expect(handle.taskId).toBeDefined();
      expect(handle.status).toBe('queued');
    });

    test('should publish task_available notification', async () => {
      const request: TaskRequest = {
        conversationId: 'test-notify',
        taskType: 'test',
        payload: {},
      };

      // Subscribe to notifications before submitting
      let notified = false;
      const pubsub = coordinator.getPubSub();
      await pubsub.subscribe('agent_task_available', () => {
        notified = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      await coordinator.submitTask(request);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(notified).toBe(true);
    });

    test('should reject submission before initialization', async () => {
      const uninitCoordinator = new PoolCoordinator(pool);

      const request: TaskRequest = {
        conversationId: 'test',
        taskType: 'code',
        payload: {},
      };

      await expect(uninitCoordinator.submitTask(request)).rejects.toThrow(
        'Not initialized'
      );
    });
  });

  describe('waitForResult', () => {
    test('should wait for task completion', async () => {
      const request: TaskRequest = {
        conversationId: 'wait-test',
        taskType: 'code',
        payload: {},
      };

      const handle = await coordinator.submitTask(request);

      // Simulate task completion in background
      setTimeout(async () => {
        const queue = coordinator.getQueue();
        await queue.complete(handle.taskId, { success: true });
      }, 100);

      const result = await coordinator.waitForResult(handle.taskId, 5000);

      expect(result.status).toBe('completed');
      expect(result.result).toEqual({ success: true });
    });

    test('should throw on task failure', async () => {
      const request: TaskRequest = {
        conversationId: 'fail-test',
        taskType: 'code',
        payload: {},
      };

      const handle = await coordinator.submitTask(request);

      // Simulate task failure
      setTimeout(async () => {
        const queue = coordinator.getQueue();
        await queue.fail(handle.taskId, 'Test error');
      }, 100);

      await expect(coordinator.waitForResult(handle.taskId, 5000)).rejects.toThrow(
        'failed'
      );
    });

    test('should timeout if task takes too long', async () => {
      const request: TaskRequest = {
        conversationId: 'timeout-test',
        taskType: 'code',
        payload: {},
      };

      const handle = await coordinator.submitTask(request);

      // Don't complete the task, let it timeout
      await expect(coordinator.waitForResult(handle.taskId, 500)).rejects.toThrow(
        'timed out'
      );
    });
  });

  describe('stopTask', () => {
    test('should stop a running task', async () => {
      const request: TaskRequest = {
        conversationId: 'stop-test',
        taskType: 'code',
        payload: {},
      };

      const handle = await coordinator.submitTask(request);

      await coordinator.stopTask(handle.taskId);

      const queue = coordinator.getQueue();
      const task = await queue.getTask(handle.taskId);

      expect(task?.status).toBe('failed');
      expect(task?.error).toContain('Stopped');
    });
  });

  describe('getPoolStatus', () => {
    test('should return accurate pool status', async () => {
      const registry = coordinator.getRegistry();

      // Register some agents
      await registry.register('agent-1');
      await registry.register('agent-2');
      await registry.register('agent-3');

      await registry.setStatus('agent-2', 'busy');

      // Submit some tasks
      await coordinator.submitTask({
        conversationId: 'status-1',
        taskType: 'code',
        payload: {},
      });

      await coordinator.submitTask({
        conversationId: 'status-2',
        taskType: 'code',
        payload: {},
      });

      const status = await coordinator.getPoolStatus();

      expect(status.totalAgents).toBe(3);
      expect(status.idleAgents).toBe(2);
      expect(status.busyAgents).toBe(1);
      expect(status.queuedTasks).toBe(2);
    });
  });

  describe('cleanup tasks', () => {
    test('should prune stale agents periodically', async () => {
      const registry = coordinator.getRegistry();

      await registry.register('stale-agent');

      // Manually set old heartbeat
      await pool.query(
        `UPDATE agent_pool SET last_heartbeat = NOW() - INTERVAL '10 minutes' WHERE agent_id = $1`,
        ['stale-agent']
      );

      // Wait for cleanup cycle (normally runs every 30 seconds, but we can trigger manually)
      await registry.pruneStale(120);

      const agent = await registry.getAgent('stale-agent');
      expect(agent?.status).toBe('offline');
    });

    test('should reassign stuck tasks periodically', async () => {
      const queue = coordinator.getQueue();

      const taskId = await queue.enqueue({
        conversationId: 'stuck-task',
        taskType: 'code',
        payload: {},
      });

      await queue.dequeue('agent-stuck');
      await queue.markRunning(taskId);

      // Set old started_at timestamp
      await pool.query(
        `UPDATE pool_tasks SET started_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
        [taskId]
      );

      await queue.reassignStuckTasks(300);

      const task = await queue.getTask(taskId);
      expect(task?.status).toBe('queued');
    });
  });

  describe('shutdown', () => {
    test('should shutdown cleanly', async () => {
      await coordinator.shutdown();

      const pubsub = coordinator.getPubSub();
      expect(pubsub.getActiveChannels().length).toBe(0);
    });
  });
});
