# FEAT-003: Multi-Agent Pool (No Redis)

**Status:** Ready for Implementation
**Priority:** P0 - MVP
**Branch:** `claude/multi-agent-no-redis-Af1ZK`

---

## Summary

Enable 3-12 parallel Claude agents coordinated via **PostgreSQL only** - no Redis required. Uses PostgreSQL's native `NOTIFY/LISTEN` for pub/sub and simple tables for task queuing. Aligns with project philosophy: **single-developer tool, minimal infrastructure**.

---

## Why No Redis?

| Aspect | Redis Approach | PostgreSQL Approach |
|--------|---------------|---------------------|
| Infrastructure | +1 service to deploy/monitor | Already have it |
| Pub/Sub | Redis channels | `NOTIFY/LISTEN` (built-in) |
| Task Queue | Sorted sets | Simple table + indexes |
| Latency | <1ms | 5-50ms (fine for our scale) |
| Complexity | High | Low |
| Data Persistence | Manual (RDB/AOF) | Automatic (ACID) |

**Bottom line:** Redis solves distributed-at-scale problems we don't have. PostgreSQL handles 3-12 agents easily.

---

## Architecture

### Current State (What Exists)

```
src/
├── agent/           # Agent worker code (uses Redis - needs refactor)
│   ├── worker.ts
│   ├── heartbeat.ts
│   └── session.ts
├── redis/           # Redis client (DELETE this)
│   ├── client.ts
│   ├── channels.ts
│   └── messages.ts
├── swarm/           # Swarm coordinator (already works in-memory!)
│   ├── swarm-coordinator.ts
│   ├── task-decomposer.ts
│   └── agent-spawner.ts
└── orchestrator/
    └── pool-manager.ts  # Uses Redis (needs refactor)
```

### Target State

```
src/
├── pool/                    # NEW: PostgreSQL-based agent pool
│   ├── agent-registry.ts    # Agent registration & heartbeats
│   ├── task-queue.ts        # Priority task queue
│   ├── pubsub.ts            # NOTIFY/LISTEN wrapper
│   └── pool-coordinator.ts  # Main coordination logic
├── agent/                   # REFACTOR: Remove Redis deps
│   ├── worker.ts            # Uses pool/pubsub instead
│   └── session.ts           # Unchanged
├── swarm/                   # KEEP: Already works without Redis
└── orchestrator/
    └── orchestrator.ts      # Integrate pool coordinator
```

---

## Database Schema

### New Tables

```sql
-- Agent registry: Track active agents
CREATE TABLE agent_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',  -- idle, busy, offline
  capabilities JSONB DEFAULT '[]',              -- ['code', 'review', 'test']
  current_task_id UUID REFERENCES pool_tasks(id),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_agent_pool_status ON agent_pool(status);
CREATE INDEX idx_agent_pool_heartbeat ON agent_pool(last_heartbeat);

-- Task queue: Priority-ordered work items
CREATE TABLE pool_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL,
  task_type VARCHAR(50) NOT NULL,              -- 'code', 'review', 'test', 'plan'
  priority INT NOT NULL DEFAULT 5,             -- 1=highest, 10=lowest
  status VARCHAR(20) NOT NULL DEFAULT 'queued', -- queued, assigned, running, completed, failed
  payload JSONB NOT NULL,                      -- Task-specific data
  result JSONB,                                -- Completion result
  assigned_agent_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX idx_pool_tasks_queue ON pool_tasks(priority, created_at)
  WHERE status = 'queued';
CREATE INDEX idx_pool_tasks_agent ON pool_tasks(assigned_agent_id)
  WHERE status IN ('assigned', 'running');

-- Task results: Stream results back to coordinator
CREATE TABLE pool_task_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pool_tasks(id),
  result_type VARCHAR(50) NOT NULL,  -- 'chunk', 'tool_call', 'complete', 'error'
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pool_task_results_task ON pool_task_results(task_id, created_at);
```

### Pub/Sub Channels (via NOTIFY/LISTEN)

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `agent_task_available` | Coordinator → Agents | New task in queue |
| `agent_task_assigned_{agent_id}` | Coordinator → Agent | Task assigned to specific agent |
| `agent_result_{task_id}` | Agent → Coordinator | Task result/progress |
| `agent_heartbeat` | Agent → Coordinator | Health check |
| `agent_stop_{agent_id}` | Coordinator → Agent | Stop current work |

---

## Implementation Plan

### Phase 1: Database & Core (Day 1)

1. **Create migration**
   - `migrations/003_agent_pool.sql`
   - Tables: `agent_pool`, `pool_tasks`, `pool_task_results`

2. **Create pub/sub wrapper** (`src/pool/pubsub.ts`)
   ```typescript
   export class PgPubSub {
     async publish(channel: string, payload: unknown): Promise<void>;
     async subscribe(channel: string, handler: (payload: unknown) => void): Promise<void>;
     async unsubscribe(channel: string): Promise<void>;
   }
   ```

3. **Create agent registry** (`src/pool/agent-registry.ts`)
   ```typescript
   export class AgentRegistry {
     async register(agentId: string, capabilities: string[]): Promise<void>;
     async heartbeat(agentId: string): Promise<void>;
     async setStatus(agentId: string, status: AgentStatus): Promise<void>;
     async getAvailable(): Promise<Agent[]>;
     async pruneStale(maxAge: Duration): Promise<string[]>;
   }
   ```

### Phase 2: Task Queue (Day 1-2)

4. **Create task queue** (`src/pool/task-queue.ts`)
   ```typescript
   export class TaskQueue {
     async enqueue(task: PoolTask): Promise<string>;
     async dequeue(agentId: string): Promise<PoolTask | null>;
     async complete(taskId: string, result: TaskResult): Promise<void>;
     async fail(taskId: string, error: string): Promise<void>;
     async getStatus(taskId: string): Promise<TaskStatus>;
   }
   ```

5. **Create pool coordinator** (`src/pool/pool-coordinator.ts`)
   ```typescript
   export class PoolCoordinator {
     async initialize(): Promise<void>;
     async submitTask(task: TaskRequest): Promise<TaskHandle>;
     async waitForResult(taskId: string): Promise<TaskResult>;
     async stopTask(taskId: string): Promise<void>;
     async getPoolStatus(): Promise<PoolStatus>;
   }
   ```

### Phase 3: Agent Worker (Day 2)

6. **Refactor agent worker** (`src/agent/worker.ts`)
   - Remove all Redis imports
   - Use `PgPubSub` for communication
   - Use `TaskQueue` for work items
   - Use `AgentRegistry` for registration

7. **Simplify heartbeat** (`src/agent/heartbeat.ts`)
   - Just update `last_heartbeat` column
   - No Redis involved

### Phase 4: Integration (Day 2-3)

8. **Integrate with orchestrator**
   - `submitToPool()` for parallel tasks
   - Fall back to single-agent for simple requests
   - Stream results back to platform

9. **Add feature flags**
   ```env
   FEATURE_AGENT_POOL=true      # Enable pool coordination
   AGENT_POOL_SIZE=3            # Number of agents (3-12)
   AGENT_HEARTBEAT_INTERVAL=30  # Seconds between heartbeats
   AGENT_STALE_THRESHOLD=120    # Seconds before agent considered dead
   ```

### Phase 5: Cleanup (Day 3)

10. **Delete Redis code**
    - Remove `src/redis/` directory
    - Remove `redis` from `package.json`
    - Update feature flags in `src/config/features.ts`

11. **Update documentation**
    - Remove Redis from docker-compose
    - Update CLAUDE.md
    - Update BACKLOG.md

---

## Key Code Examples

### PgPubSub Implementation

```typescript
// src/pool/pubsub.ts
import { Pool, PoolClient } from 'pg';

export class PgPubSub {
  private subscriptions = new Map<string, PoolClient>();

  constructor(private pool: Pool) {}

  async publish(channel: string, payload: unknown): Promise<void> {
    const json = JSON.stringify(payload);
    await this.pool.query('SELECT pg_notify($1, $2)', [channel, json]);
  }

  async subscribe(
    channel: string,
    handler: (payload: unknown) => void
  ): Promise<void> {
    const client = await this.pool.connect();
    await client.query(`LISTEN ${channel}`);

    client.on('notification', (msg) => {
      if (msg.channel === channel && msg.payload) {
        handler(JSON.parse(msg.payload));
      }
    });

    this.subscriptions.set(channel, client);
  }

  async unsubscribe(channel: string): Promise<void> {
    const client = this.subscriptions.get(channel);
    if (client) {
      await client.query(`UNLISTEN ${channel}`);
      client.release();
      this.subscriptions.delete(channel);
    }
  }
}
```

### Task Assignment Flow

```typescript
// Coordinator side
async function assignNextTask(agentId: string): Promise<void> {
  const task = await taskQueue.dequeue(agentId);
  if (task) {
    await pubsub.publish(`agent_task_assigned_${agentId}`, task);
  }
}

// Agent side
await pubsub.subscribe(`agent_task_assigned_${myAgentId}`, async (task) => {
  await registry.setStatus(myAgentId, 'busy');
  try {
    const result = await executeTask(task);
    await taskQueue.complete(task.id, result);
  } catch (error) {
    await taskQueue.fail(task.id, error.message);
  } finally {
    await registry.setStatus(myAgentId, 'idle');
    await pubsub.publish('agent_heartbeat', { agentId: myAgentId, status: 'idle' });
  }
});
```

---

## Testing Strategy

### Unit Tests
- `pubsub.test.ts` - NOTIFY/LISTEN wrapper
- `agent-registry.test.ts` - Registration, heartbeats
- `task-queue.test.ts` - Enqueue, dequeue, priorities

### Integration Tests
- Multi-agent task distribution
- Agent failure recovery
- Task timeout handling
- Pool scaling up/down

### Manual Validation
```bash
# Start app with pool enabled
FEATURE_AGENT_POOL=true AGENT_POOL_SIZE=3 bun run dev

# Via test adapter
curl -X POST http://localhost:3000/test/message \
  -d '{"conversationId":"test-pool","message":"/pool-status"}'

# Check pool via psql
SELECT agent_id, status, last_heartbeat FROM agent_pool;
SELECT id, status, priority, assigned_agent_id FROM pool_tasks;
```

---

## Success Criteria

- [ ] 3+ agents running concurrently
- [ ] Tasks distributed based on priority
- [ ] Agent failures detected and recovered
- [ ] No Redis dependency
- [ ] Latency < 100ms for task assignment
- [ ] Clean pool status via `/pool-status` command

---

## Files to Create/Modify

### Create
- `migrations/003_agent_pool.sql`
- `src/pool/pubsub.ts`
- `src/pool/agent-registry.ts`
- `src/pool/task-queue.ts`
- `src/pool/pool-coordinator.ts`
- `src/pool/types.ts`
- `src/pool/index.ts`

### Modify
- `src/agent/worker.ts` - Remove Redis, use pool
- `src/agent/heartbeat.ts` - Simplify to DB update
- `src/orchestrator/orchestrator.ts` - Integrate pool
- `src/config/features.ts` - Update flags
- `src/index.ts` - Initialize pool on startup

### Delete
- `src/redis/` (entire directory)
- `src/orchestrator/pool-manager.ts` (replaced by pool-coordinator)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| NOTIFY payload size limit (8KB) | Only send task IDs, fetch full task from DB |
| Connection pool exhaustion | Dedicated connections for LISTEN (separate pool) |
| Stale agent detection | Background job prunes agents with old heartbeats |
| Task stuck in "running" | Timeout + reassignment logic |

---

## Out of Scope (Future)

- Distributed agents across machines (stay single-process for now)
- Agent specialization/routing (all agents equal initially)
- Dynamic pool scaling (fixed size for MVP)
- Cross-conversation task sharing (1 conversation = 1 pool session)
