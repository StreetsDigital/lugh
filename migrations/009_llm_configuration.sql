-- LLM Configuration Table
-- Stores routing rules and provider settings for multi-LLM agent system

CREATE TABLE IF NOT EXISTS llm_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider agent counts (how many agents per provider)
    claude_agent_count INTEGER DEFAULT 3,
    grok_agent_count INTEGER DEFAULT 0,
    openai_agent_count INTEGER DEFAULT 0,
    ollama_agent_count INTEGER DEFAULT 0,

    -- Routing rules: which task types use which provider
    -- Format: { "coding": "claude-code", "chat": "grok", "analysis": "openai" }
    routing_rules JSONB DEFAULT '{
        "coding": "claude-code",
        "analysis": "claude-code",
        "review": "claude-code",
        "planning": "claude-code",
        "chat": "claude-code"
    }'::jsonb,

    -- Cost optimization settings
    cost_optimization_enabled BOOLEAN DEFAULT false,
    max_cost_per_task DECIMAL(10, 4) DEFAULT NULL,
    prefer_local_models BOOLEAN DEFAULT false,

    -- Model preferences per provider
    -- Format: { "openai": "gpt-4o", "grok": "grok-2", "ollama": "llama3.2" }
    model_preferences JSONB DEFAULT '{
        "openai": "gpt-4o",
        "grok": "grok-2",
        "ollama": "llama3.2"
    }'::jsonb,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one configuration row exists (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS llm_configuration_singleton
    ON llm_configuration ((true));

-- Insert default configuration
INSERT INTO llm_configuration (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- API Keys table (encrypted storage recommended in production)
CREATE TABLE IF NOT EXISTS llm_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL UNIQUE,
    api_key TEXT NOT NULL,
    base_url TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    last_validated_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_llm_api_keys_provider ON llm_api_keys(provider);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_llm_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for llm_configuration
DROP TRIGGER IF EXISTS llm_configuration_updated ON llm_configuration;
CREATE TRIGGER llm_configuration_updated
    BEFORE UPDATE ON llm_configuration
    FOR EACH ROW
    EXECUTE FUNCTION update_llm_config_timestamp();

-- Trigger for llm_api_keys
DROP TRIGGER IF EXISTS llm_api_keys_updated ON llm_api_keys;
CREATE TRIGGER llm_api_keys_updated
    BEFORE UPDATE ON llm_api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_llm_config_timestamp();
