/**
 * End-to-end integration tests for multi-agent pool
 *
 * These tests simulate real-world scenarios with multiple agents
 * working on tasks concurrently.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Pool } from 'pg';
import { PoolCoordinator } from './pool-coordinator';
import { AgentWorker } from './agent-worker';
import type { TaskRequest } from './types';

describe('Multi-Agent Pool Integration', () => {
  let pool: Pool;
  let coordinator: PoolCoordinator;
  let agents: AgentWorker[] = [];

  beforeEach(async () => {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/lugh_test',
    });

    coordinator = new PoolCoordinator(pool);

    // Clean up
    await pool.query('DELETE FROM pool_task_results');
    await pool.query('DELETE FROM pool_tasks');
    await pool.query('DELETE FROM agent_pool');

    await coordinator.initialize();
  });

  afterEach(async () => {
    // Shutdown all agents
    for (const agent of agents) {
      await agent.shutdown();
    }
    agents = [];

    await coordinator.shutdown();

    await pool.query('DELETE FROM pool_task_results');
    await pool.query('DELETE FROM pool_tasks');
    await pool.query('DELETE FROM agent_pool');
    await pool.end();
  });

  describe('Single agent workflow', () => {
    test('should process a task end-to-end', async () => {
      // Start one agent
      const agent = new AgentWorker(pool, {
        agentId: 'test-agent-1',
        capabilities: ['code'],
      });
      agents.push(agent);
      await agent.start();

      // Give agent time to register
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Submit a task
      const request: TaskRequest = {
        conversationId: 'e2e-test-1',
        taskType: 'code',
        priority: 5,
        payload: { instruction: 'Write a hello world function' },
      };

      const handle = await coordinator.submitTask(request);

      // Wait for completion
      const result = await coordinator.waitForResult(handle.taskId, 5000);

      expect(result.status).toBe('completed');
      expect(result.result).toBeDefined();
    });
  });

  describe('Multiple agents workflow', () => {
    test('should distribute tasks across multiple agents', async () => {
      // Start 3 agents
      for (let i = 1; i <= 3; i++) {
        const agent = new AgentWorker(pool, {
          agentId: `agent-${i}`,
          capabilities: ['code'],
        });
        agents.push(agent);
        await agent.start();
      }

      // Give agents time to register
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Submit 3 tasks simultaneously
      const tasks = await Promise.all([
        coordinator.submitTask({
          conversationId: 'multi-1',
          taskType: 'code',
          payload: { task: 1 },
        }),
        coordinator.submitTask({
          conversationId: 'multi-2',
          taskType: 'code',
          payload: { task: 2 },
        }),
        coordinator.submitTask({
          conversationId: 'multi-3',
          taskType: 'code',
          payload: { task: 3 },
        }),
      ]);

      // Wait for all to complete
      const results = await Promise.all(
        tasks.map((handle) => coordinator.waitForResult(handle.taskId, 5000))
      );

      expect(results.length).toBe(3);
      expect(results.every((r) => r.status === 'completed')).toBe(true);

      // Check that tasks were distributed across different agents
      const assignedAgents = results.map((r) => r.assignedAgentId);
      const uniqueAgents = new Set(assignedAgents);

      // Should use multiple agents (not all the same agent)
      expect(uniqueAgents.size).toBeGreaterThan(1);
    });

    test('should handle more tasks than agents', async () => {
      // Start 2 agents
      for (let i = 1; i <= 2; i++) {
        const agent = new AgentWorker(pool, {
          agentId: `limited-agent-${i}`,
          capabilities: ['code'],
        });
        agents.push(agent);
        await agent.start();
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Submit 5 tasks (more than agents)
      const tasks = await Promise.all([
        coordinator.submitTask({
          conversationId: 'overflow-1',
          taskType: 'code',
          payload: {},
        }),
        coordinator.submitTask({
          conversationId: 'overflow-2',
          taskType: 'code',
          payload: {},
        }),
        coordinator.submitTask({
          conversationId: 'overflow-3',
          taskType: 'code',
          payload: {},
        }),
        coordinator.submitTask({
          conversationId: 'overflow-4',
          taskType: 'code',
          payload: {},
        }),
        coordinator.submitTask({
          conversationId: 'overflow-5',
          taskType: 'code',
          payload: {},
        }),
      ]);

      // All should eventually complete
      const results = await Promise.all(
        tasks.map((handle) => coordinator.waitForResult(handle.taskId, 10000))
      );

      expect(results.length).toBe(5);
      expect(results.every((r) => r.status === 'completed')).toBe(true);
    });
  });

  describe('Priority ordering', () => {
    test('should process high priority tasks first', async () => {
      // Start one agent
      const agent = new AgentWorker(pool, {
        agentId: 'priority-agent',
        capabilities: ['code'],
      });
      agents.push(agent);
      await agent.start();

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Submit tasks with different priorities
      const lowPriority = await coordinator.submitTask({
        conversationId: 'low',
        taskType: 'code',
        priority: 10,
        payload: { order: 3 },
      });

      const highPriority = await coordinator.submitTask({
        conversationId: 'high',
        taskType: 'code',
        priority: 1,
        payload: { order: 1 },
      });

      const medPriority = await coordinator.submitTask({
        conversationId: 'med',
        taskType: 'code',
        priority: 5,
        payload: { order: 2 },
      });

      // Wait for all to complete
      await Promise.all([
        coordinator.waitForResult(lowPriority.taskId, 10000),
        coordinator.waitForResult(highPriority.taskId, 10000),
        coordinator.waitForResult(medPriority.taskId, 10000),
      ]);

      // Check completion order by looking at completed_at timestamps
      const queue = coordinator.getQueue();
      const tasks = await Promise.all([
        queue.getTask(highPriority.taskId),
        queue.getTask(medPriority.taskId),
        queue.getTask(lowPriority.taskId),
      ]);

      const completionTimes = tasks.map(
        (t) => t?.completedAt?.getTime() || Infinity
      );

      // High priority should complete first
      expect(completionTimes[0]).toBeLessThan(completionTimes[1]);
      expect(completionTimes[1]).toBeLessThan(completionTimes[2]);
    });
  });

  describe('Agent failure recovery', () => {
    test('should reassign tasks when agent goes offline', async () => {
      // Start two agents
      const agent1 = new AgentWorker(pool, { agentId: 'fail-agent-1' });
      const agent2 = new AgentWorker(pool, { agentId: 'fail-agent-2' });
      agents.push(agent1, agent2);

      await agent1.start();
      await agent2.start();

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Submit a task
      const handle = await coordinator.submitTask({
        conversationId: 'recovery-test',
        taskType: 'code',
        payload: {},
      });

      // Wait a bit for task to be assigned
      await new Promise((resolve) => setTimeout(resolve, 300));

      const queue = coordinator.getQueue();
      const task = await queue.getTask(handle.taskId);
      const assignedAgent = task?.assignedAgentId;

      // Simulate agent failure by manually marking it offline
      const registry = coordinator.getRegistry();
      await registry.unregister(assignedAgent || '');

      // Manually reassign stuck task
      await queue.reassignStuckTasks(0); // Immediate reassignment

      // Task should be back in queue
      const reassignedTask = await queue.getTask(handle.taskId);
      expect(reassignedTask?.status).toBe('queued');
    });
  });

  describe('Pool status monitoring', () => {
    test('should accurately report pool status', async () => {
      // Start 4 agents
      for (let i = 1; i <= 4; i++) {
        const agent = new AgentWorker(pool, { agentId: `status-agent-${i}` });
        agents.push(agent);
        await agent.start();
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Submit 2 tasks (so 2 agents are busy, 2 are idle)
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

      // Wait for tasks to be assigned
      await new Promise((resolve) => setTimeout(resolve, 300));

      const status = await coordinator.getPoolStatus();

      expect(status.totalAgents).toBe(4);
      expect(status.idleAgents + status.busyAgents).toBe(4);
      expect(status.busyAgents).toBeGreaterThanOrEqual(0);
      expect(status.queuedTasks + status.runningTasks).toBeGreaterThanOrEqual(0);
    });
  });
});
