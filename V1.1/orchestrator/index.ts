/**
 * V1.1 Orchestrator Entry Point
 * ==============================
 *
 * Main entry point for the God-Tier orchestrator.
 * Starts all components and manages graceful shutdown.
 *
 * Components:
 * - Redis connection for pub/sub messaging
 * - Agent Pool Manager (tracks agents, dispatches tasks)
 * - Verification Engine (validates agent claims)
 * - Recovery Manager (handles failures, escalation)
 * - Platform Integrations (Telegram, Slack, Discord, Web)
 * - Health endpoint for Docker health checks
 */

import express, { type Express, type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startTelegramPoolIntegration, TelegramPoolIntegration } from './telegram-integration';
import { createLLMConfigRouter } from './llm-config-api';
import { createSwarmRouter } from './swarm-api';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const ENABLED_PLATFORMS = (process.env.ENABLED_PLATFORMS || 'telegram').split(',');

/**
 * Main orchestrator application
 */
class Orchestrator {
  private app: Express;
  private server: ReturnType<Express['listen']> | null = null;
  private telegramIntegration: TelegramPoolIntegration | null = null;
  private isShuttingDown = false;

  constructor() {
    this.app = express();

    // Middleware
    this.app.use(express.json());

    // Serve static files (LLM config UI)
    this.app.use(express.static(path.join(__dirname, '../public')));

    // Serve Electron renderer script (for desktop app)
    this.app.use('/electron', express.static(path.join(__dirname, '../electron')));

    // API routes
    this.app.use('/api/llm', createLLMConfigRouter());
    this.app.use('/api/swarm', createSwarmRouter());

    // Redirect root to LLM config
    this.app.get('/', (_req: Request, res: Response) => {
      res.redirect('/llm-config.html');
    });

    this.setupHealthEndpoints();
  }

  /**
   * Set up health check endpoints
   */
  private setupHealthEndpoints(): void {
    // Health check for Docker
    this.app.get('/health', (_req: Request, res: Response) => {
      if (this.isShuttingDown) {
        res.status(503).json({ status: 'shutting_down' });
        return;
      }

      res.json({
        status: 'healthy',
        version: '1.1.0',
        uptime: process.uptime(),
        platforms: ENABLED_PLATFORMS,
      });
    });

    // Detailed status
    this.app.get('/status', (_req: Request, res: Response) => {
      // Get pool status from Telegram integration (if enabled)
      let poolStatus = null;
      if (this.telegramIntegration) {
        // The pool manager is internal to TelegramPoolIntegration
        // For now, just indicate it's running
        poolStatus = { active: true };
      }

      res.json({
        version: '1.1.0',
        uptime: process.uptime(),
        platforms: {
          telegram: ENABLED_PLATFORMS.includes('telegram'),
          slack: ENABLED_PLATFORMS.includes('slack'),
          discord: ENABLED_PLATFORMS.includes('discord'),
          web: ENABLED_PLATFORMS.includes('web'),
        },
        pool: poolStatus,
      });
    });
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    console.log('='.repeat(60));
    console.log('🚀 AgentCommander V1.1 - God-Tier Orchestrator');
    console.log('='.repeat(60));
    console.log(`📡 Enabled platforms: ${ENABLED_PLATFORMS.join(', ')}`);
    console.log('');

    // Start HTTP server for health checks and web UI
    this.server = this.app.listen(PORT, () => {
      console.log(`🏥 Health endpoint: http://localhost:${PORT}/health`);
      console.log(`⚙️  LLM Config UI: http://localhost:${PORT}/llm-config.html`);
      console.log(`🐝 Swarm API: http://localhost:${PORT}/api/swarm`);
    });

    // Start platform integrations
    if (ENABLED_PLATFORMS.includes('telegram')) {
      try {
        console.log('📱 Starting Telegram integration...');
        this.telegramIntegration = await startTelegramPoolIntegration();
        console.log('✅ Telegram integration ready');
      } catch (error) {
        console.error('❌ Telegram integration failed:', error);
        // Continue without Telegram if it fails
      }
    }

    if (ENABLED_PLATFORMS.includes('slack')) {
      console.log('💬 Slack integration: Not yet implemented in V1.1');
      // TODO: Port SlackPoolIntegration from V1.0 adapter
    }

    if (ENABLED_PLATFORMS.includes('discord')) {
      console.log('🎮 Discord integration: Not yet implemented in V1.1');
      // TODO: Port DiscordPoolIntegration from V1.0 adapter
    }

    if (ENABLED_PLATFORMS.includes('web')) {
      console.log('🌐 Web dashboard: Not yet implemented');
      // TODO: Add web dashboard routes
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('🎯 Orchestrator ready. Waiting for agents to register...');
    console.log('='.repeat(60));

    // Handle graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        console.log('Already shutting down...');
        return;
      }

      this.isShuttingDown = true;
      console.log(`\n⏹️ Received ${signal}, shutting down gracefully...`);

      // Stop platform integrations
      if (this.telegramIntegration) {
        console.log('📱 Stopping Telegram...');
        await this.telegramIntegration.stop();
      }

      // Stop HTTP server
      if (this.server) {
        console.log('🏥 Stopping health server...');
        this.server.close();
      }

      console.log('👋 Goodbye!');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught exception:', error);
      shutdown('uncaughtException').catch(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason) => {
      console.error('💥 Unhandled rejection:', reason);
      // Don't exit on unhandled rejections, just log
    });
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;

    if (this.telegramIntegration) {
      await this.telegramIntegration.stop();
    }

    if (this.server) {
      this.server.close();
    }
  }
}

// Main entry point
const orchestrator = new Orchestrator();
orchestrator.start().catch((error) => {
  console.error('💥 Failed to start orchestrator:', error);
  process.exit(1);
});

export { Orchestrator };
