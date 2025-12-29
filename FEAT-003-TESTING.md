# FEAT-003 Multi-Agent Pool - Testing Guide

## ⚠️ Prerequisites

Before enabling the multi-agent pool, you need to:

1. **Apply the database migration**
2. **Enable feature flags**
3. **Run tests**
4. **Monitor the system**

---

## Step 1: Apply Database Migration

The pool requires 3 new PostgreSQL tables. Apply the migration:

```bash
# On your server (where DATABASE_URL is set)
cd /path/to/makewithLugh

# Apply migration
psql $DATABASE_URL < migrations/010_agent_pool.sql

# Verify tables were created
psql $DATABASE_URL -c "\dt agent_pool pool_tasks pool_task_results"
```

**Expected output:**
```
                  List of relations
 Schema |        Name         | Type  |  Owner
--------+---------------------+-------+----------
 public | agent_pool          | table | postgres
 public | pool_task_results   | table | postgres
 public | pool_tasks          | table | postgres
```

---

## Step 2: Enable Feature Flags

Update your `.env` file (or environment variables):

```bash
# Enable the agent pool
FEATURE_AGENT_POOL=true

# Configure pool size (3-12 agents)
AGENT_POOL_SIZE=4

# Configure timeouts
AGENT_HEARTBEAT_INTERVAL=30000      # 30 seconds
AGENT_STALE_THRESHOLD=120           # 2 minutes
AGENT_TASK_TIMEOUT=300              # 5 minutes
```

**Note:** If using Docker, update your `.env` file and rebuild:

```bash
docker compose down
docker compose up -d --build
```

---

## Step 3: Run Tests (Optional but Recommended)

### 3.1 Create Test Database

```bash
# Create test database
psql $DATABASE_URL -c "CREATE DATABASE lugh_test;"

# Apply migration to test database
psql postgresql://postgres:postgres@localhost:5432/lugh_test < migrations/010_agent_pool.sql
```

### 3.2 Run Test Suite

```bash
# Set test database URL
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lugh_test"

# Run all pool tests (66 tests)
bun test src/pool/

# Run specific test files
bun test src/pool/pubsub.test.ts          # 13 tests
bun test src/pool/agent-registry.test.ts  # 16 tests
bun test src/pool/task-queue.test.ts      # 18 tests
bun test src/pool/pool-coordinator.test.ts # 12 tests
bun test src/pool/integration.test.ts     # 7 tests

# Run with coverage
bun test --coverage src/pool/
```

**Expected output:**
```
✓ PgPubSub > publish > should publish a message to a channel
✓ PgPubSub > subscribe > should subscribe to a channel and receive messages
...
✓ Multi-Agent Pool Integration > Multiple agents workflow > should distribute tasks

66 tests passed (0 failed)
```

---

## Step 4: Verify System Health

### 4.1 Check Application Logs

```bash
# If using Docker
docker compose logs -f app | grep -E "PoolCoordinator|Agent|TaskQueue"

# Look for these messages:
# [PoolCoordinator] Initialized (poolSize: 4, staleThreshold: 120s)
# [Agent agent-xxx] Ready and listening for tasks
# [TaskQueue] Enqueued task xxx
# [Agent agent-xxx] Completed task xxx
```

### 4.2 Check Database Tables

```bash
# Check registered agents
psql $DATABASE_URL -c "SELECT agent_id, status, last_heartbeat FROM agent_pool;"

# Check task queue
psql $DATABASE_URL -c "SELECT id, status, priority, task_type FROM pool_tasks ORDER BY created_at DESC LIMIT 10;"

# Check pool statistics
psql $DATABASE_URL -c "
SELECT
  (SELECT COUNT(*) FROM agent_pool WHERE status='idle') as idle_agents,
  (SELECT COUNT(*) FROM agent_pool WHERE status='busy') as busy_agents,
  (SELECT COUNT(*) FROM pool_tasks WHERE status='queued') as queued_tasks,
  (SELECT COUNT(*) FROM pool_tasks WHERE status='running') as running_tasks;
"
```

### 4.3 Monitor Heartbeats

Agents send heartbeats every 30 seconds. Watch them in real-time:

```bash
psql $DATABASE_URL -c "
SELECT agent_id, status, last_heartbeat,
       NOW() - last_heartbeat as time_since_heartbeat
FROM agent_pool
ORDER BY last_heartbeat DESC;
"
```

If `time_since_heartbeat` > 2 minutes, agents are marked as offline.

---

## Step 5: Test Basic Functionality

### 5.1 Manual Test via SQL

```bash
# Submit a test task
psql $DATABASE_URL -c "
INSERT INTO pool_tasks (conversation_id, task_type, priority, payload)
VALUES ('test-conv-1', 'general', 5, '{\"test\": true}')
RETURNING id, status;
"

# Watch it get assigned
psql $DATABASE_URL -c "
SELECT id, status, assigned_agent_id, created_at, started_at
FROM pool_tasks
WHERE conversation_id = 'test-conv-1';
"
```

### 5.2 Check for Errors

```bash
# Check for failed tasks
psql $DATABASE_URL -c "
SELECT id, task_type, error, created_at
FROM pool_tasks
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 5;
"

# Check for offline agents
psql $DATABASE_URL -c "
SELECT agent_id, last_heartbeat,
       NOW() - last_heartbeat as offline_duration
FROM agent_pool
WHERE status = 'offline';
"
```

---

## Troubleshooting

### Issue: No agents registered

**Symptoms:**
```sql
SELECT COUNT(*) FROM agent_pool;
-- Returns 0
```

**Solutions:**
- Check that `FEATURE_AGENT_POOL=true` in environment
- Restart the application: `docker compose restart app`
- Check logs for initialization errors

### Issue: Tasks stuck in "queued" status

**Symptoms:**
```sql
SELECT COUNT(*) FROM pool_tasks WHERE status='queued';
-- Returns > 0 but never decreases
```

**Solutions:**
- Check if agents are registered: `SELECT * FROM agent_pool;`
- Check if agents are idle: `SELECT COUNT(*) FROM agent_pool WHERE status='idle';`
- Manually reassign stuck tasks:
  ```sql
  UPDATE pool_tasks
  SET status='queued', assigned_agent_id=NULL
  WHERE status IN ('assigned', 'running')
  AND started_at < NOW() - INTERVAL '5 minutes';
  ```

### Issue: Agents marked as offline

**Symptoms:**
```sql
SELECT COUNT(*) FROM agent_pool WHERE status='offline';
-- Returns > 0
```

**Solutions:**
- Check if application is running: `docker compose ps`
- Check heartbeat interval: `AGENT_HEARTBEAT_INTERVAL` should be < `AGENT_STALE_THRESHOLD`
- Manually reset agent status:
  ```sql
  UPDATE agent_pool SET status='idle', last_heartbeat=NOW() WHERE status='offline';
  ```

### Issue: Migration fails

**Error:** `relation "agent_pool" already exists`

**Solution:** Migration already applied, skip to Step 2.

**Error:** `permission denied`

**Solution:** Ensure database user has CREATE TABLE permissions:
```sql
GRANT CREATE ON SCHEMA public TO postgres;
```

---

## Performance Monitoring

### Query Performance

Check task assignment speed:

```sql
SELECT
  task_type,
  AVG(EXTRACT(EPOCH FROM (started_at - created_at))) as avg_queue_time_seconds,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_execution_time_seconds,
  COUNT(*) as total_tasks
FROM pool_tasks
WHERE status IN ('completed', 'failed')
GROUP BY task_type;
```

### Agent Utilization

```sql
SELECT
  agent_id,
  status,
  COUNT(*) FILTER (WHERE current_task_id IS NOT NULL) as active_tasks,
  MAX(last_heartbeat) as last_seen
FROM agent_pool
GROUP BY agent_id, status;
```

---

## Rolling Back (If Needed)

If you need to disable the pool:

```bash
# 1. Disable feature flag
export FEATURE_AGENT_POOL=false

# 2. Restart application
docker compose restart app

# 3. (Optional) Clean up tables
psql $DATABASE_URL -c "DELETE FROM pool_task_results;"
psql $DATABASE_URL -c "DELETE FROM pool_tasks;"
psql $DATABASE_URL -c "DELETE FROM agent_pool;"

# 4. (Optional) Drop tables entirely
psql $DATABASE_URL -c "DROP TABLE pool_task_results;"
psql $DATABASE_URL -c "DROP TABLE pool_tasks;"
psql $DATABASE_URL -c "DROP TABLE agent_pool;"
```

The system will revert to single-agent mode (FEATURE_LEGACY_SINGLE_AGENT=true).

---

## Success Criteria

✅ **Pool is working correctly if:**

1. Agents register on startup: `SELECT COUNT(*) FROM agent_pool WHERE status='idle';` returns > 0
2. Heartbeats are current: All `last_heartbeat` values are within 1 minute
3. Tasks complete: `SELECT COUNT(*) FROM pool_tasks WHERE status='completed';` increases over time
4. No stuck tasks: `SELECT COUNT(*) FROM pool_tasks WHERE status='running' AND started_at < NOW() - INTERVAL '10 minutes';` returns 0
5. Test suite passes: `bun test src/pool/` shows 66/66 passing

---

## Next Steps

Once the pool is working:

1. **Monitor for 24 hours** - Check for memory leaks, stuck tasks, offline agents
2. **Integrate with orchestrator** - Connect pool to main message handler
3. **Add Claude Code execution** - Implement actual AI sessions in workers
4. **Create `/pool-status` command** - User-facing pool health check
5. **Scale up** - Try 8 or 12 agents if load increases

---

## Support

If you encounter issues:
- Check application logs: `docker compose logs -f app`
- Review database state: Use SQL queries above
- Check feature flags: `echo $FEATURE_AGENT_POOL`
- Run test suite: `bun test src/pool/`
- Consult spec: `features/FEAT-003-multi-agent-no-redis.md`
