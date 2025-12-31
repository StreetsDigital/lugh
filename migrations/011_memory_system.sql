-- Migration 011: Memory System
-- CAMEL AI-inspired memory architecture for agent context management
-- Provides both recency-based (chat history) and semantic (vector) retrieval

-- Enable pgvector extension if available (optional - falls back to in-memory)
-- Run manually: CREATE EXTENSION IF NOT EXISTS vector;

-- Memory records: Core storage for all memory types
CREATE TABLE IF NOT EXISTS memory_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- OpenAI text-embedding-3-small dimensions
  record_type VARCHAR(50) NOT NULL DEFAULT 'message',  -- message, decision, code, summary, context
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for conversation lookups (chat history)
CREATE INDEX IF NOT EXISTS idx_memory_records_conversation
  ON memory_records(conversation_id, created_at DESC);

-- Index for record type filtering
CREATE INDEX IF NOT EXISTS idx_memory_records_type
  ON memory_records(conversation_id, record_type);

-- Vector similarity index (only if pgvector extension is available)
-- This uses IVFFlat for approximate nearest neighbor search
-- Falls back gracefully if vector type doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    -- Create IVFFlat index for fast similarity search
    -- lists = 100 is good for up to ~1M vectors
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_records_embedding
      ON memory_records USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)';
    RAISE NOTICE 'Created vector similarity index (pgvector available)';
  ELSE
    RAISE NOTICE 'pgvector extension not available - vector search will use fallback';
  END IF;
END $$;

-- Partial index for messages only (most common query)
CREATE INDEX IF NOT EXISTS idx_memory_records_messages
  ON memory_records(conversation_id, created_at DESC)
  WHERE record_type = 'message';

-- Partial index for semantic search (records with embeddings)
CREATE INDEX IF NOT EXISTS idx_memory_records_with_embedding
  ON memory_records(conversation_id)
  WHERE embedding IS NOT NULL;

-- Add summary field to sessions for conversation continuity
ALTER TABLE remote_agent_sessions
  ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN remote_agent_sessions.summary IS 'LLM-generated summary of conversation for context continuity';

-- Comments for documentation
COMMENT ON TABLE memory_records IS 'Agent memory storage for chat history and semantic search (CAMEL AI pattern)';
COMMENT ON COLUMN memory_records.conversation_id IS 'Foreign key to conversation (not enforced for flexibility)';
COMMENT ON COLUMN memory_records.content IS 'Text content of the memory record';
COMMENT ON COLUMN memory_records.embedding IS 'Vector embedding for semantic similarity search (1536 dims for OpenAI)';
COMMENT ON COLUMN memory_records.record_type IS 'Type: message (chat), decision (important), code (snippets), summary (condensed), context (misc)';
COMMENT ON COLUMN memory_records.metadata IS 'Additional metadata: role, filePath, language, etc.';

-- Function to clean up old memory records (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_memory_records(
  days_to_keep INT DEFAULT 30
) RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM memory_records
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL
    AND record_type = 'message';  -- Only clean up messages, keep decisions/code

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_memory_records IS 'Clean up old message records, keeping decisions and code';
