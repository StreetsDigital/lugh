-- Remote Coding Agent - Combined Schema
-- Version: Combined (includes migrations 001-010)
-- Description: Complete database schema (idempotent - safe to run multiple times)

-- ============================================================================
-- Migration 001: Initial Schema
-- ============================================================================

-- Table 1: Codebases
CREATE TABLE IF NOT EXISTS remote_agent_codebases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  repository_url VARCHAR(500),
  default_cwd VARCHAR(500) NOT NULL,
  ai_assistant_type VARCHAR(20) DEFAULT 'claude',
  commands JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: Conversations
CREATE TABLE IF NOT EXISTS remote_agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_type VARCHAR(20) NOT NULL,
  platform_conversation_id VARCHAR(255) NOT NULL,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  cwd VARCHAR(500),
  ai_assistant_type VARCHAR(20) DEFAULT 'claude',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform_type, platform_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_conversations_codebase ON remote_agent_conversations(codebase_id);

-- Table 3: Sessions
CREATE TABLE IF NOT EXISTS remote_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES remote_agent_conversations(id) ON DELETE CASCADE,
  codebase_id UUID REFERENCES remote_agent_codebases(id),
  ai_assistant_type VARCHAR(20) NOT NULL,
  assistant_session_id VARCHAR(255),
  active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_sessions_conversation ON remote_agent_sessions(conversation_id, active);
CREATE INDEX IF NOT EXISTS idx_remote_agent_sessions_codebase ON remote_agent_sessions(codebase_id);

-- ============================================================================
-- Migration 002: Command Templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS remote_agent_command_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remote_agent_command_templates_name ON remote_agent_command_templates(name);

-- ============================================================================
-- Migration 003: Add Worktree Support
-- ============================================================================

ALTER TABLE remote_agent_conversations
ADD COLUMN IF NOT EXISTS worktree_path VARCHAR(500);

COMMENT ON COLUMN remote_agent_conversations.worktree_path IS
  'Path to git worktree for this conversation. If set, AI works here instead of cwd.';

-- ============================================================================
-- Migration 004: Worktree Sharing Index
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_remote_agent_conversations_worktree
ON remote_agent_conversations(worktree_path)
WHERE worktree_path IS NOT NULL;

-- ============================================================================
-- Migration 006: Isolation Environments
-- ============================================================================

CREATE TABLE IF NOT EXISTS remote_agent_isolation_environments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codebase_id           UUID NOT NULL REFERENCES remote_agent_codebases(id) ON DELETE CASCADE,

  -- Workflow identification (what work this is for)
  workflow_type         TEXT NOT NULL,        -- 'issue', 'pr', 'review', 'thread', 'task'
  workflow_id           TEXT NOT NULL,        -- '42', 'pr-99', 'thread-abc123'

  -- Implementation details
  provider              TEXT NOT NULL DEFAULT 'worktree',
  working_path          TEXT NOT NULL,        -- Actual filesystem path
  branch_name           TEXT NOT NULL,        -- Git branch name

  -- Lifecycle
  status                TEXT NOT NULL DEFAULT 'active',  -- 'active', 'destroyed'
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_platform   TEXT,                 -- 'github', 'slack', etc.

  -- Cross-reference metadata (for linking)
  metadata              JSONB DEFAULT '{}',

  CONSTRAINT unique_workflow UNIQUE (codebase_id, workflow_type, workflow_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_isolation_env_codebase
  ON remote_agent_isolation_environments(codebase_id);
CREATE INDEX IF NOT EXISTS idx_isolation_env_status
  ON remote_agent_isolation_environments(status);
CREATE INDEX IF NOT EXISTS idx_isolation_env_workflow
  ON remote_agent_isolation_environments(workflow_type, workflow_id);

-- Add FK to conversations
ALTER TABLE remote_agent_conversations
  ADD COLUMN IF NOT EXISTS isolation_env_id UUID
    REFERENCES remote_agent_isolation_environments(id) ON DELETE SET NULL;

-- Add last_activity_at for staleness detection
ALTER TABLE remote_agent_conversations
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for FK lookups
CREATE INDEX IF NOT EXISTS idx_conversations_isolation_env_id
  ON remote_agent_conversations(isolation_env_id);

COMMENT ON TABLE remote_agent_isolation_environments IS
  'Work-centric isolated environments with independent lifecycle';
COMMENT ON COLUMN remote_agent_isolation_environments.workflow_type IS
  'Type of work: issue, pr, review, thread, task';
COMMENT ON COLUMN remote_agent_isolation_environments.workflow_id IS
  'Identifier for the work (issue number, PR number, thread hash, etc.)';

-- ============================================================================
-- Migration 008: Agent Approvals (Phone Vibecoding V1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS remote_agent_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES remote_agent_sessions(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL,
  tool_input JSONB NOT NULL,
  risk_level VARCHAR(20) DEFAULT 'high',
  status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, timeout
  responded_by VARCHAR(100),              -- user ID who responded
  responded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Index for fast lookup of pending approvals by session
CREATE INDEX IF NOT EXISTS idx_remote_agent_approvals_session
  ON remote_agent_approvals(session_id, status);

-- Index for cleanup of expired approvals
CREATE INDEX IF NOT EXISTS idx_remote_agent_approvals_expires
  ON remote_agent_approvals(expires_at)
  WHERE status = 'pending';

COMMENT ON TABLE remote_agent_approvals IS
  'Stores tool execution records for phone-based approval workflow';

-- ============================================================================
-- Migration 010: Agent Pool (PostgreSQL-based, no Redis)
-- ============================================================================

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
-- Note: Using DO block for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_agent_pool_current_task'
      AND table_name = 'agent_pool'
  ) THEN
    ALTER TABLE agent_pool
      ADD CONSTRAINT fk_agent_pool_current_task
      FOREIGN KEY (current_task_id)
      REFERENCES pool_tasks(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE agent_pool IS 'Registry of active agents in the pool (3-12 concurrent agents)';
COMMENT ON TABLE pool_tasks IS 'Priority task queue for distributing work to agents';
COMMENT ON TABLE pool_task_results IS 'Streaming results from agents back to coordinator';

COMMENT ON COLUMN agent_pool.status IS 'Agent status: idle (available), busy (working), offline (dead)';
COMMENT ON COLUMN agent_pool.capabilities IS 'Agent capabilities array: ["code", "review", "test", "plan"]';
COMMENT ON COLUMN pool_tasks.priority IS 'Task priority: 1=highest, 10=lowest';
COMMENT ON COLUMN pool_tasks.status IS 'Task status: queued, assigned, running, completed, failed';
