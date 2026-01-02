/**
 * Unit tests for Agent Registry
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Pool } from 'pg';
import { AgentRegistry } from './agent-registry';

describe('AgentRegistry', () => {
  let pool: Pool;
  let registry: AgentRegistry;

  beforeEach(async () => {
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/lugh_test',
    });
    registry = new AgentRegistry(pool);

    // Clean up test data
    await pool.query('DELETE FROM agent_pool');
  });

  afterEach(async () => {
    await pool.query('DELETE FROM agent_pool');
    await pool.end();
  });

  describe('register', () => {
    test('should register a new agent', async () => {
      const agentId = 'test-agent-1';
      const capabilities = ['code', 'review'];

      await registry.register(agentId, capabilities);

      const agent = await registry.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent?.agentId).toBe(agentId);
      expect(agent?.status).toBe('idle');
      expect(agent?.capabilities).toEqual(capabilities);
    });

    test('should update existing agent on re-registration', async () => {
      const agentId = 'test-agent-2';

      await registry.register(agentId, ['code']);
      await registry.register(agentId, ['code', 'test']);

      const agent = await registry.getAgent(agentId);
      expect(agent?.capabilities).toEqual(['code', 'test']);
    });

    test('should default to general capability', async () => {
      const agentId = 'test-agent-3';

      await registry.register(agentId);

      const agent = await registry.getAgent(agentId);
      expect(agent?.capabilities).toEqual(['general']);
    });
  });

  describe('heartbeat', () => {
    test('should update agent heartbeat timestamp', async () => {
      const agentId = 'test-agent-heartbeat';

      await registry.register(agentId);

      const before = await registry.getAgent(agentId);
      const beforeTime = before?.lastHeartbeat.getTime() || 0;

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 100));

      await registry.heartbeat(agentId);

      const after = await registry.getAgent(agentId);
      const afterTime = after?.lastHeartbeat.getTime() || 0;

      expect(afterTime).toBeGreaterThan(beforeTime);
    });

    test('should handle heartbeat for non-existent agent gracefully', async () => {
      // Should not throw, just warn
      await expect(registry.heartbeat('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('setStatus', () => {
    test('should update agent status', async () => {
      const agentId = 'test-agent-status';

      await registry.register(agentId);
      await registry.setStatus(agentId, 'busy');

      const agent = await registry.getAgent(agentId);
      expect(agent?.status).toBe('busy');
    });

    test('should update current task ID', async () => {
      const agentId = 'test-agent-task';
      const taskId = 'task-123';

      await registry.register(agentId);
      await registry.setStatus(agentId, 'busy', taskId);

      const agent = await registry.getAgent(agentId);
      expect(agent?.currentTaskId).toBe(taskId);
    });

    test('should clear task ID when going idle', async () => {
      const agentId = 'test-agent-idle';

      await registry.register(agentId);
      await registry.setStatus(agentId, 'busy', 'task-456');
      await registry.setStatus(agentId, 'idle');

      const agent = await registry.getAgent(agentId);
      expect(agent?.status).toBe('idle');
      expect(agent?.currentTaskId).toBeNull();
    });
  });

  describe('getAvailable', () => {
    test('should return only idle agents', async () => {
      await registry.register('idle-1');
      await registry.register('idle-2');
      await registry.register('busy-1');

      await registry.setStatus('busy-1', 'busy');

      const available = await registry.getAvailable();

      expect(available.length).toBe(2);
      expect(available.map(a => a.agentId)).toContain('idle-1');
      expect(available.map(a => a.agentId)).toContain('idle-2');
      expect(available.map(a => a.agentId)).not.toContain('busy-1');
    });

    test('should return empty array when no idle agents', async () => {
      await registry.register('busy-only');
      await registry.setStatus('busy-only', 'busy');

      const available = await registry.getAvailable();
      expect(available.length).toBe(0);
    });
  });

  describe('getAllAgents', () => {
    test('should return all agents regardless of status', async () => {
      await registry.register('agent-1');
      await registry.register('agent-2');
      await registry.register('agent-3');

      await registry.setStatus('agent-2', 'busy');
      await registry.setStatus('agent-3', 'offline');

      const all = await registry.getAllAgents();
      expect(all.length).toBe(3);
    });
  });

  describe('pruneStale', () => {
    test('should mark stale agents as offline', async () => {
      const agentId = 'stale-agent';

      await registry.register(agentId);

      // Manually set old heartbeat timestamp
      await pool.query(
        `UPDATE agent_pool SET last_heartbeat = NOW() - INTERVAL '5 minutes' WHERE agent_id = $1`,
        [agentId]
      );

      const pruned = await registry.pruneStale(120); // 2 minutes threshold

      expect(pruned).toContain(agentId);

      const agent = await registry.getAgent(agentId);
      expect(agent?.status).toBe('offline');
    });

    test('should not prune recently active agents', async () => {
      const agentId = 'active-agent';

      await registry.register(agentId);
      await registry.heartbeat(agentId);

      const pruned = await registry.pruneStale(120);

      expect(pruned).not.toContain(agentId);

      const agent = await registry.getAgent(agentId);
      expect(agent?.status).toBe('idle');
    });
  });

  describe('unregister', () => {
    test('should mark agent as offline', async () => {
      const agentId = 'unregister-test';

      await registry.register(agentId);
      await registry.setStatus(agentId, 'busy', 'task-789');

      await registry.unregister(agentId);

      const agent = await registry.getAgent(agentId);
      expect(agent?.status).toBe('offline');
      expect(agent?.currentTaskId).toBeNull();
    });
  });

  describe('getStatusCounts', () => {
    test('should return accurate counts by status', async () => {
      await registry.register('idle-1');
      await registry.register('idle-2');
      await registry.register('busy-1');
      await registry.register('offline-1');

      await registry.setStatus('busy-1', 'busy');
      await registry.setStatus('offline-1', 'offline');

      const counts = await registry.getStatusCounts();

      expect(counts.idle).toBe(2);
      expect(counts.busy).toBe(1);
      expect(counts.offline).toBe(1);
      expect(counts.total).toBe(4);
    });

    test('should return zero counts when no agents', async () => {
      const counts = await registry.getStatusCounts();

      expect(counts.idle).toBe(0);
      expect(counts.busy).toBe(0);
      expect(counts.offline).toBe(0);
      expect(counts.total).toBe(0);
    });
  });
});
