/**
 * LLM Configuration API
 * =====================
 *
 * REST API for managing LLM provider configuration and routing rules.
 */

import { Router, type Request, type Response } from 'express';
import pg from 'pg';

const { Pool } = pg;

// Database connection (reuse from orchestrator)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * LLM Configuration types
 */
export interface LLMConfiguration {
  id: string;
  claude_agent_count: number;
  grok_agent_count: number;
  openai_agent_count: number;
  ollama_agent_count: number;
  routing_rules: Record<string, string>;
  cost_optimization_enabled: boolean;
  max_cost_per_task: number | null;
  prefer_local_models: boolean;
  model_preferences: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface LLMApiKey {
  id: string;
  provider: string;
  api_key: string;
  base_url: string | null;
  is_active: boolean;
  last_validated_at: string | null;
}

/**
 * Create the LLM configuration router
 */
export function createLLMConfigRouter(): Router {
  const router = Router();

  // Middleware to parse JSON
  router.use((_req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });

  /**
   * GET /api/llm/config
   * Get current LLM configuration
   */
  router.get('/config', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query<LLMConfiguration>(
        'SELECT * FROM llm_configuration LIMIT 1'
      );

      if (result.rows.length === 0) {
        // Create default config if none exists
        const insertResult = await pool.query<LLMConfiguration>(
          'INSERT INTO llm_configuration DEFAULT VALUES RETURNING *'
        );
        res.json(insertResult.rows[0]);
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[LLM Config API] Error getting config:', error);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  /**
   * PUT /api/llm/config
   * Update LLM configuration
   */
  router.put('/config', async (req: Request, res: Response) => {
    try {
      const {
        claude_agent_count,
        grok_agent_count,
        openai_agent_count,
        ollama_agent_count,
        routing_rules,
        cost_optimization_enabled,
        max_cost_per_task,
        prefer_local_models,
        model_preferences,
      } = req.body;

      const result = await pool.query<LLMConfiguration>(
        `UPDATE llm_configuration SET
          claude_agent_count = COALESCE($1, claude_agent_count),
          grok_agent_count = COALESCE($2, grok_agent_count),
          openai_agent_count = COALESCE($3, openai_agent_count),
          ollama_agent_count = COALESCE($4, ollama_agent_count),
          routing_rules = COALESCE($5::jsonb, routing_rules),
          cost_optimization_enabled = COALESCE($6, cost_optimization_enabled),
          max_cost_per_task = COALESCE($7, max_cost_per_task),
          prefer_local_models = COALESCE($8, prefer_local_models),
          model_preferences = COALESCE($9::jsonb, model_preferences)
        RETURNING *`,
        [
          claude_agent_count,
          grok_agent_count,
          openai_agent_count,
          ollama_agent_count,
          routing_rules ? JSON.stringify(routing_rules) : null,
          cost_optimization_enabled,
          max_cost_per_task,
          prefer_local_models,
          model_preferences ? JSON.stringify(model_preferences) : null,
        ]
      );

      console.log('[LLM Config API] Configuration updated');
      res.json(result.rows[0]);
    } catch (error) {
      console.error('[LLM Config API] Error updating config:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  /**
   * GET /api/llm/providers
   * Get list of available providers with their status
   */
  router.get('/providers', async (_req: Request, res: Response) => {
    try {
      // Get API keys status
      const keysResult = await pool.query<LLMApiKey>(
        'SELECT provider, is_active, last_validated_at FROM llm_api_keys'
      );

      const keyStatus = new Map(
        keysResult.rows.map((k) => [k.provider, k])
      );

      const providers = [
        {
          id: 'claude-code',
          name: 'Claude Code',
          description: 'Agentic coding with tool use (file ops, git, tests)',
          hasApiKey: !!process.env.CLAUDE_CODE_OAUTH_TOKEN || keyStatus.has('claude'),
          isActive: true,
          supportsTools: true,
          costPerMillion: 15,
        },
        {
          id: 'grok',
          name: 'Grok',
          description: 'xAI Grok - Fast and cost-effective',
          hasApiKey: !!process.env.XAI_API_KEY || keyStatus.has('grok'),
          isActive: keyStatus.get('grok')?.is_active ?? false,
          supportsTools: false,
          costPerMillion: 10,
        },
        {
          id: 'openai',
          name: 'OpenAI GPT',
          description: 'GPT-4o and other OpenAI models',
          hasApiKey: !!process.env.OPENAI_API_KEY || keyStatus.has('openai'),
          isActive: keyStatus.get('openai')?.is_active ?? false,
          supportsTools: false,
          costPerMillion: 10,
        },
        {
          id: 'ollama',
          name: 'Ollama (Local)',
          description: 'Local models - free, no API key needed',
          hasApiKey: true, // Always available (local)
          isActive: true,
          supportsTools: false,
          costPerMillion: 0,
        },
      ];

      res.json(providers);
    } catch (error) {
      console.error('[LLM Config API] Error getting providers:', error);
      res.status(500).json({ error: 'Failed to get providers' });
    }
  });

  /**
   * POST /api/llm/api-keys
   * Add or update an API key
   */
  router.post('/api-keys', async (req: Request, res: Response) => {
    try {
      const { provider, api_key, base_url } = req.body;

      if (!provider || !api_key) {
        res.status(400).json({ error: 'Provider and api_key are required' });
        return;
      }

      const result = await pool.query<LLMApiKey>(
        `INSERT INTO llm_api_keys (provider, api_key, base_url, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (provider) DO UPDATE SET
           api_key = EXCLUDED.api_key,
           base_url = EXCLUDED.base_url,
           is_active = true
         RETURNING id, provider, is_active, last_validated_at`,
        [provider, api_key, base_url]
      );

      console.log(`[LLM Config API] API key saved for ${provider}`);
      res.json({ success: true, provider: result.rows[0].provider });
    } catch (error) {
      console.error('[LLM Config API] Error saving API key:', error);
      res.status(500).json({ error: 'Failed to save API key' });
    }
  });

  /**
   * DELETE /api/llm/api-keys/:provider
   * Remove an API key
   */
  router.delete('/api-keys/:provider', async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;

      await pool.query('DELETE FROM llm_api_keys WHERE provider = $1', [provider]);

      console.log(`[LLM Config API] API key removed for ${provider}`);
      res.json({ success: true });
    } catch (error) {
      console.error('[LLM Config API] Error removing API key:', error);
      res.status(500).json({ error: 'Failed to remove API key' });
    }
  });

  /**
   * GET /api/llm/agents
   * Get current agent pool status (from Redis)
   */
  router.get('/agents', async (_req: Request, res: Response) => {
    try {
      // TODO: Get real agent status from Redis
      // For now, return mock data based on config
      const configResult = await pool.query<LLMConfiguration>(
        'SELECT * FROM llm_configuration LIMIT 1'
      );

      const config = configResult.rows[0];

      const agents = [
        {
          provider: 'claude-code',
          configured: config?.claude_agent_count ?? 3,
          active: 0, // TODO: Get from Redis
          idle: 0,
          busy: 0,
        },
        {
          provider: 'grok',
          configured: config?.grok_agent_count ?? 0,
          active: 0,
          idle: 0,
          busy: 0,
        },
        {
          provider: 'openai',
          configured: config?.openai_agent_count ?? 0,
          active: 0,
          idle: 0,
          busy: 0,
        },
        {
          provider: 'ollama',
          configured: config?.ollama_agent_count ?? 0,
          active: 0,
          idle: 0,
          busy: 0,
        },
      ];

      res.json(agents);
    } catch (error) {
      console.error('[LLM Config API] Error getting agents:', error);
      res.status(500).json({ error: 'Failed to get agent status' });
    }
  });

  return router;
}
