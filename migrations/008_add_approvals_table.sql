-- Agent Approvals - Phone Vibecoding V1
-- Version: 8.0
-- Description: Store pending tool approvals for Telegram inline buttons

-- Table: Agent Approvals
CREATE TABLE remote_agent_approvals (
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
CREATE INDEX idx_remote_agent_approvals_session ON remote_agent_approvals(session_id, status);

-- Index for cleanup of expired approvals
CREATE INDEX idx_remote_agent_approvals_expires ON remote_agent_approvals(expires_at) WHERE status = 'pending';

-- Comment for documentation
COMMENT ON TABLE remote_agent_approvals IS
  'Stores pending tool execution approvals for phone-based approval workflow';
