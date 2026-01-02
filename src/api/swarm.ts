/**
 * Swarm API
 * =========
 *
 * REST API endpoints for triggering and monitoring swarm execution.
 * This is how the chat agent spawns parallel LLM instances.
 */

import { Router, type Request, type Response } from 'express';
import { isEnabled } from '../config/features';
import { swarmCoordinator, resultSynthesizer, getAvailableRoles, taskDecomposer } from '../swarm';
import type { SwarmSession } from '../swarm/types';

/**
 * Active swarm sessions for SSE streaming
 */
const sseClients = new Map<string, Response[]>();

/**
 * Create the Swarm API router
 * Requires FEATURE_SWARM_COORDINATION to be enabled
 */
export function createSwarmRouter(): Router {
  if (!isEnabled('SWARM_COORDINATION')) {
    throw new Error(
      '[Swarm API] SWARM_COORDINATION feature is not enabled. ' +
        'Set FEATURE_SWARM_COORDINATION=true to use swarm execution.'
    );
  }

  const router = Router();

  // Set up event streaming from coordinator
  swarmCoordinator.onEvent(event => {
    const clients = sseClients.get(event.swarmId) || [];
    const eventData = JSON.stringify(event);

    for (const client of clients) {
      try {
        client.write(`data: ${eventData}\n\n`);
      } catch {
        // Client disconnected
      }
    }
  });

  /**
   * POST /api/swarm/execute
   * Start a new swarm execution
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { request, conversationId } = req.body;

      if (!request) {
        res.status(400).json({ error: 'Request is required' });
        return;
      }

      console.log(`[Swarm API] Starting swarm for: ${request.substring(0, 100)}...`);

      // Start swarm execution (async)
      const sessionPromise = swarmCoordinator.execute(
        request,
        conversationId || `web-${Date.now()}`
      );

      // Get the initial session state
      const session = await new Promise<SwarmSession>(resolve => {
        const checkSession = () => {
          const sessions = swarmCoordinator.getActiveSessions();
          const session = sessions.find(
            s => s.originalRequest === request && s.status !== 'completed'
          );
          if (session) {
            resolve(session);
          } else {
            setTimeout(checkSession, 100);
          }
        };
        checkSession();

        // Timeout after 5 seconds
        setTimeout(() => {
          resolve({
            id: 'pending',
            conversationId: conversationId || 'web',
            originalRequest: request,
            decomposedTask: null as any,
            agents: [],
            status: 'decomposing',
            startedAt: new Date(),
            completedAt: null,
            synthesizedResult: null,
          });
        }, 5000);
      });

      // Return immediately with swarm ID
      res.json({
        swarmId: session.id,
        status: session.status,
        message: 'Swarm started. Use /api/swarm/status/:id to monitor progress.',
        streamUrl: `/api/swarm/stream/${session.id}`,
      });

      // Continue execution in background
      sessionPromise.catch(error => {
        console.error('[Swarm API] Swarm execution failed:', error);
      });
    } catch (error) {
      console.error('[Swarm API] Failed to start swarm:', error);
      res.status(500).json({ error: 'Failed to start swarm execution' });
    }
  });

  /**
   * POST /api/swarm/decompose
   * Decompose a request without executing (preview)
   */
  router.post('/decompose', async (req: Request, res: Response) => {
    try {
      const { request } = req.body;

      if (!request) {
        res.status(400).json({ error: 'Request is required' });
        return;
      }

      console.log(`[Swarm API] Decomposing: ${request.substring(0, 100)}...`);

      const decomposedTask = await taskDecomposer.decompose(request);

      res.json({
        projectName: decomposedTask.projectName,
        projectDescription: decomposedTask.projectDescription,
        subTasks: decomposedTask.subTasks.map(t => ({
          id: t.id,
          role: t.role,
          title: t.title,
          description: t.description,
          priority: t.priority,
          estimatedDuration: t.estimatedDuration,
          dependencies: t.dependencies,
        })),
        executionStrategy: decomposedTask.executionStrategy,
        estimatedTotalDuration: decomposedTask.estimatedTotalDuration,
      });
    } catch (error) {
      console.error('[Swarm API] Decomposition failed:', error);
      res.status(500).json({ error: 'Failed to decompose request' });
    }
  });

  /**
   * GET /api/swarm/status/:swarmId
   * Get current status of a swarm
   */
  router.get('/status/:swarmId', (req: Request, res: Response) => {
    const { swarmId } = req.params;

    const session = swarmCoordinator.getSession(swarmId);
    if (!session) {
      res.status(404).json({ error: 'Swarm not found' });
      return;
    }

    const progress = swarmCoordinator.getProgress(swarmId);

    res.json({
      swarmId: session.id,
      status: session.status,
      projectName: session.decomposedTask?.projectName,
      progress: progress
        ? {
            total: progress.total,
            completed: progress.completed,
            running: progress.running,
            failed: progress.failed,
            percent:
              progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
          }
        : null,
      agents: progress?.agents || [],
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    });
  });

  /**
   * GET /api/swarm/result/:swarmId
   * Get final result of a completed swarm
   */
  router.get('/result/:swarmId', (req: Request, res: Response) => {
    const { swarmId } = req.params;
    const format = (req.query.format as string) || 'json';

    const session = swarmCoordinator.getSession(swarmId);
    if (!session) {
      res.status(404).json({ error: 'Swarm not found' });
      return;
    }

    if (session.status !== 'completed' || !session.synthesizedResult) {
      res.status(400).json({
        error: 'Swarm not completed',
        status: session.status,
      });
      return;
    }

    if (format === 'markdown') {
      const markdown = resultSynthesizer.formatAsMarkdown(session.synthesizedResult);
      res.setHeader('Content-Type', 'text/markdown');
      res.send(markdown);
    } else {
      res.json(session.synthesizedResult);
    }
  });

  /**
   * GET /api/swarm/stream/:swarmId
   * Server-Sent Events stream for real-time updates
   */
  router.get('/stream/:swarmId', (req: Request, res: Response) => {
    const { swarmId } = req.params;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add client to swarm's client list
    if (!sseClients.has(swarmId)) {
      sseClients.set(swarmId, []);
    }
    sseClients.get(swarmId)!.push(res);

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', swarmId })}\n\n`);

    // Clean up on disconnect
    req.on('close', () => {
      const clients = sseClients.get(swarmId) || [];
      const index = clients.indexOf(res);
      if (index > -1) {
        clients.splice(index, 1);
      }
      if (clients.length === 0) {
        sseClients.delete(swarmId);
      }
    });
  });

  /**
   * POST /api/swarm/cancel/:swarmId
   * Cancel a running swarm
   */
  router.post('/cancel/:swarmId', async (req: Request, res: Response) => {
    const { swarmId } = req.params;

    const cancelled = await swarmCoordinator.cancel(swarmId);
    if (!cancelled) {
      res.status(404).json({ error: 'Swarm not found or already completed' });
      return;
    }

    res.json({ success: true, message: 'Swarm cancelled' });
  });

  /**
   * GET /api/swarm/roles
   * Get available agent roles
   */
  router.get('/roles', (_req: Request, res: Response) => {
    const roles = getAvailableRoles();

    // Import role configs for descriptions
    import('../swarm/role-configs').then(({ ROLE_CONFIGS }) => {
      const roleDetails = roles.map(role => ({
        id: role,
        name: ROLE_CONFIGS[role].name,
        description: ROLE_CONFIGS[role].description,
        requiresTools: ROLE_CONFIGS[role].requiresTools,
        preferredProvider: ROLE_CONFIGS[role].preferredProvider,
      }));

      res.json(roleDetails);
    });
  });

  /**
   * GET /api/swarm/active
   * Get all active swarms
   */
  router.get('/active', (_req: Request, res: Response) => {
    const sessions = swarmCoordinator.getActiveSessions();

    res.json(
      sessions.map(s => ({
        swarmId: s.id,
        conversationId: s.conversationId,
        status: s.status,
        projectName: s.decomposedTask?.projectName,
        agentCount: s.agents.length,
        startedAt: s.startedAt,
      }))
    );
  });

  /**
   * GET /api/swarm/providers
   * Get available LLM providers
   */
  router.get('/providers', async (_req: Request, res: Response) => {
    const { getAvailableLLMProviders, DEFAULT_PROVIDER_CONFIGS, llmProviderFactory } =
      await import('../swarm');

    const available = getAvailableLLMProviders();
    const allProviders = Object.entries(DEFAULT_PROVIDER_CONFIGS).map(([type, config]) => ({
      type,
      model: config.model,
      baseUrl: config.baseUrl,
      available: available.includes(type as any),
    }));

    const customConfigs = llmProviderFactory
      .listConfigs()
      .filter(c => c.config.type === 'custom')
      .map(c => ({
        id: c.id,
        type: 'custom',
        model: c.config.model,
        baseUrl: c.config.baseUrl,
        available: true,
      }));

    res.json({
      providers: allProviders,
      customProviders: customConfigs,
      available,
    });
  });

  /**
   * POST /api/swarm/providers/custom
   * Register a custom LLM provider
   */
  router.post('/providers/custom', async (req: Request, res: Response) => {
    try {
      const { id, baseUrl, model, apiKey, maxTokens, temperature } = req.body;

      if (!id || !baseUrl || !model) {
        res.status(400).json({ error: 'id, baseUrl, and model are required' });
        return;
      }

      const { llmProviderFactory } = await import('../swarm');

      const config = {
        type: 'custom' as const,
        baseUrl,
        model,
        apiKey,
        maxTokens: maxTokens || 4096,
        temperature: temperature || 0.7,
      };

      llmProviderFactory.registerCustomConfig(id, config);

      res.json({
        success: true,
        message: `Custom provider '${id}' registered`,
        config: { id, baseUrl, model, maxTokens: config.maxTokens },
      });
    } catch (error) {
      console.error('[Swarm API] Failed to register custom provider:', error);
      res.status(500).json({ error: 'Failed to register custom provider' });
    }
  });

  /**
   * POST /api/swarm/providers/configure
   * Configure provider settings for swarm execution
   */
  router.post('/providers/configure', async (req: Request, res: Response) => {
    try {
      const { defaultProvider, roleOverrides } = req.body;

      const { agentSpawner } = await import('../swarm');

      if (defaultProvider) {
        agentSpawner.setDefaultProvider(defaultProvider);
      }

      if (roleOverrides && typeof roleOverrides === 'object') {
        for (const [role, provider] of Object.entries(roleOverrides)) {
          agentSpawner.setRoleProvider(role, provider as any);
        }
      }

      res.json({
        success: true,
        message: 'Provider configuration updated',
        config: { defaultProvider, roleOverrides },
      });
    } catch (error) {
      console.error('[Swarm API] Failed to configure providers:', error);
      res.status(500).json({ error: 'Failed to configure providers' });
    }
  });

  /**
   * POST /api/swarm/providers/test
   * Test a provider connection
   */
  router.post('/providers/test', async (req: Request, res: Response) => {
    try {
      const { type, customId } = req.body;

      const { createProvider, llmProviderFactory } = await import('../swarm');

      let provider;
      if (customId) {
        provider = llmProviderFactory.getProvider('custom', customId);
      } else if (type) {
        provider = createProvider(type);
      } else {
        res.status(400).json({ error: 'type or customId is required' });
        return;
      }

      if (!provider.isAvailable()) {
        res.json({
          success: false,
          error: 'Provider not configured (missing API key)',
          provider: provider.getConfig().type,
        });
        return;
      }

      const startTime = Date.now();
      const result = await provider.chat([
        { role: 'user', content: 'Say "hello" in exactly one word.' },
      ]);
      const latency = Date.now() - startTime;

      res.json({
        success: true,
        provider: result.provider,
        model: result.model,
        response: result.content.substring(0, 100),
        tokensUsed: result.tokensUsed,
        latencyMs: latency,
      });
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Unknown error';
      res.json({
        success: false,
        error: err,
      });
    }
  });

  return router;
}
