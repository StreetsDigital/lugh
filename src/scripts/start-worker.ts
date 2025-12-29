#!/usr/bin/env bun
/**
 * Agent Worker Entry Point
 *
 * Starts a PostgreSQL-based agent worker that listens for tasks
 * using LISTEN/NOTIFY (no Redis required).
 *
 * Usage:
 *   bun src/scripts/start-worker.ts
 *   bun src/scripts/start-worker.ts --agent-id=worker-1
 *   bun src/scripts/start-worker.ts --capabilities=general,code-review
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 *   AGENT_ID - Override agent ID (optional)
 *   AGENT_CAPABILITIES - Comma-separated capabilities (optional)
 *   AGENT_HEARTBEAT_INTERVAL - Heartbeat interval in ms (default: 30000)
 */

import 'dotenv/config';
import { pool } from '../db/connection';
import { AgentWorker } from '../pool';
import { isEnabled } from '../config/features';

async function main(): Promise<void> {
  console.log('[Worker] Starting agent worker...');

  // Check feature flag
  if (!isEnabled('AGENT_POOL')) {
    console.error(
      '[Worker] AGENT_POOL feature is not enabled.\n' +
        'Set FEATURE_AGENT_POOL=true in your environment to run agent workers.'
    );
    process.exit(1);
  }

  // Validate database connection
  if (!process.env.DATABASE_URL) {
    console.error('[Worker] DATABASE_URL is required');
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  let agentId = process.env.AGENT_ID;
  let capabilities = process.env.AGENT_CAPABILITIES?.split(',') || ['general'];
  let heartbeatInterval = parseInt(
    process.env.AGENT_HEARTBEAT_INTERVAL || '30000',
    10
  );

  for (const arg of args) {
    if (arg.startsWith('--agent-id=')) {
      agentId = arg.split('=')[1];
    } else if (arg.startsWith('--capabilities=')) {
      capabilities = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--heartbeat=')) {
      heartbeatInterval = parseInt(arg.split('=')[1], 10);
    }
  }

  // Test database connection
  try {
    await pool.query('SELECT 1');
    console.log('[Worker] Database connected');
  } catch (error) {
    console.error('[Worker] Database connection failed:', error);
    process.exit(1);
  }

  // Create and start worker
  const worker = new AgentWorker(pool, {
    agentId,
    capabilities,
    heartbeatInterval,
  });

  try {
    await worker.start();
    console.log(`[Worker] Agent ${worker.getAgentId()} is running`);
    console.log(`[Worker] Capabilities: ${capabilities.join(', ')}`);
    console.log(`[Worker] Heartbeat interval: ${heartbeatInterval}ms`);
    console.log('[Worker] Listening for tasks via PostgreSQL NOTIFY...');
  } catch (error) {
    console.error('[Worker] Failed to start:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
