-- Migration 010: Agent Pool (PostgreSQL-based, no Redis)
-- Enables 3-12 parallel agents coordinated via PostgreSQL NOTIFY/LISTEN

-- Agent registry: Track active agents
CREATE TABLE IF NOT EXISTS agent_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'idle',  -- idle, busy, offline
  capabilities JSONB DEFAULT '[]',              -- ['code', 'review', 'test']
  current_task_id UUID,                         -- References pool_tasks(id) - added after pool_tasks
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_agent_pool_status ON agent_pool(status);
CREATE INDEX IF NOT EXISTS idx_agent_pool_heartbeat ON agent_pool(last_heartbeat);

-- Task queue: Priority-ordered work items
CREATE TABLE IF NOT EXISTS pool_tasks (
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

CREATE INDEX IF NOT EXISTS idx_pool_tasks_queue ON pool_tasks(priority, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_pool_tasks_agent ON pool_tasks(assigned_agent_id)
  WHERE status IN ('assigned', 'running');
CREATE INDEX IF NOT EXISTS idx_pool_tasks_conversation ON pool_tasks(conversation_id);

-- Task results: Stream results back to coordinator
CREATE TABLE IF NOT EXISTS pool_task_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES pool_tasks(id) ON DELETE CASCADE,
  result_type VARCHAR(50) NOT NULL,  -- 'chunk', 'tool_call', 'complete', 'error'
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_task_results_task ON pool_task_results(task_id, created_at);

-- Add foreign key constraint now that pool_tasks exists
ALTER TABLE agent_pool
  ADD CONSTRAINT fk_agent_pool_current_task
  FOREIGN KEY (current_task_id)
  REFERENCES pool_tasks(id)
  ON DELETE SET NULL;

-- Comments for documentation
COMMENT ON TABLE agent_pool IS 'Registry of active agents in the pool (3-12 concurrent agents)';
COMMENT ON TABLE pool_tasks IS 'Priority task queue for distributing work to agents';
COMMENT ON TABLE pool_task_results IS 'Streaming results from agents back to coordinator';

COMMENT ON COLUMN agent_pool.status IS 'Agent status: idle (available), busy (working), offline (dead)';
COMMENT ON COLUMN agent_pool.capabilities IS 'Agent capabilities array: ["code", "review", "test", "plan"]';
COMMENT ON COLUMN pool_tasks.priority IS 'Task priority: 1=highest, 10=lowest';
COMMENT ON COLUMN pool_tasks.status IS 'Task status: queued, assigned, running, completed, failed';
