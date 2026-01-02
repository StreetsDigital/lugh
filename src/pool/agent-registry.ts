/**
 * Agent Registry
 *
 * Manages agent registration, heartbeats, and status tracking.
 * Agents are tracked in PostgreSQL for persistence across restarts.
 */

import { Pool } from 'pg';
import type { Agent, AgentStatus } from './types.js';

export class AgentRegistry {
  constructor(private pool: Pool) {}

  /**
   * Register a new agent in the pool
   */
  async register(agentId: string, capabilities: string[] = ['general']): Promise<void> {
    try {
      await this.pool.query(
        `
        INSERT INTO agent_pool (agent_id, status, capabilities, last_heartbeat)
        VALUES ($1, 'idle', $2, NOW())
        ON CONFLICT (agent_id)
        DO UPDATE SET
          status = 'idle',
          capabilities = $2,
          last_heartbeat = NOW(),
          registered_at = NOW()
        `,
        [agentId, JSON.stringify(capabilities)]
      );

      console.log(`[AgentRegistry] Registered agent: ${agentId}`);
    } catch (error) {
      console.error(`[AgentRegistry] Failed to register agent '${agentId}':`, error);
      throw error;
    }
  }

  /**
   * Update agent heartbeat timestamp
   */
  async heartbeat(agentId: string): Promise<void> {
    try {
      const result = await this.pool.query(
        `
        UPDATE agent_pool
        SET last_heartbeat = NOW()
        WHERE agent_id = $1
        RETURNING id
        `,
        [agentId]
      );

      if (result.rowCount === 0) {
        console.warn(
          `[AgentRegistry] Heartbeat failed: agent '${agentId}' not found. ` +
            'Agent may need to re-register.'
        );
      }
    } catch (error) {
      console.error(`[AgentRegistry] Heartbeat error for agent '${agentId}':`, error);
      throw error;
    }
  }

  /**
   * Set agent status (idle, busy, offline)
   */
  async setStatus(agentId: string, status: AgentStatus, currentTaskId?: string): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE agent_pool
        SET status = $1,
            current_task_id = $2,
            last_heartbeat = NOW()
        WHERE agent_id = $3
        `,
        [status, currentTaskId || null, agentId]
      );

      console.log(`[AgentRegistry] Agent '${agentId}' status: ${status}`);
    } catch (error) {
      console.error(`[AgentRegistry] Failed to set status for agent '${agentId}':`, error);
      throw error;
    }
  }

  /**
   * Get all available (idle) agents
   */
  async getAvailable(): Promise<Agent[]> {
    try {
      const result = await this.pool.query<Agent>(
        `
        SELECT
          id,
          agent_id as "agentId",
          status,
          capabilities,
          current_task_id as "currentTaskId",
          last_heartbeat as "lastHeartbeat",
          registered_at as "registeredAt",
          metadata
        FROM agent_pool
        WHERE status = 'idle'
        ORDER BY last_heartbeat DESC
        `
      );

      return result.rows.map(row => ({
        ...row,
        capabilities: Array.isArray(row.capabilities)
          ? row.capabilities
          : JSON.parse(row.capabilities as unknown as string),
      }));
    } catch (error) {
      console.error('[AgentRegistry] Failed to get available agents:', error);
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    try {
      const result = await this.pool.query<Agent>(
        `
        SELECT
          id,
          agent_id as "agentId",
          status,
          capabilities,
          current_task_id as "currentTaskId",
          last_heartbeat as "lastHeartbeat",
          registered_at as "registeredAt",
          metadata
        FROM agent_pool
        WHERE agent_id = $1
        `,
        [agentId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        ...row,
        capabilities: Array.isArray(row.capabilities)
          ? row.capabilities
          : JSON.parse(row.capabilities as unknown as string),
      };
    } catch (error) {
      console.error(`[AgentRegistry] Failed to get agent '${agentId}':`, error);
      throw error;
    }
  }

  /**
   * Get all agents with their current status
   */
  async getAllAgents(): Promise<Agent[]> {
    try {
      const result = await this.pool.query<Agent>(
        `
        SELECT
          id,
          agent_id as "agentId",
          status,
          capabilities,
          current_task_id as "currentTaskId",
          last_heartbeat as "lastHeartbeat",
          registered_at as "registeredAt",
          metadata
        FROM agent_pool
        ORDER BY registered_at ASC
        `
      );

      return result.rows.map(row => ({
        ...row,
        capabilities: Array.isArray(row.capabilities)
          ? row.capabilities
          : JSON.parse(row.capabilities as unknown as string),
      }));
    } catch (error) {
      console.error('[AgentRegistry] Failed to get all agents:', error);
      throw error;
    }
  }

  /**
   * Prune stale agents (haven't sent heartbeat in maxAge seconds)
   *
   * Returns array of pruned agent IDs
   */
  async pruneStale(maxAgeSeconds: number = 120): Promise<string[]> {
    try {
      const result = await this.pool.query<{ agentId: string }>(
        `
        UPDATE agent_pool
        SET status = 'offline'
        WHERE status != 'offline'
          AND last_heartbeat < NOW() - INTERVAL '1 second' * $1
        RETURNING agent_id as "agentId"
        `,
        [maxAgeSeconds]
      );

      const prunedAgents = result.rows.map(r => r.agentId);

      if (prunedAgents.length > 0) {
        console.warn(
          `[AgentRegistry] Pruned ${prunedAgents.length} stale agents: ${prunedAgents.join(', ')}`
        );
      }

      return prunedAgents;
    } catch (error) {
      console.error('[AgentRegistry] Failed to prune stale agents:', error);
      throw error;
    }
  }

  /**
   * Unregister an agent (mark as offline)
   */
  async unregister(agentId: string): Promise<void> {
    try {
      await this.pool.query(
        `
        UPDATE agent_pool
        SET status = 'offline',
            current_task_id = NULL
        WHERE agent_id = $1
        `,
        [agentId]
      );

      console.log(`[AgentRegistry] Unregistered agent: ${agentId}`);
    } catch (error) {
      console.error(`[AgentRegistry] Failed to unregister agent '${agentId}':`, error);
      throw error;
    }
  }

  /**
   * Get count of agents by status
   */
  async getStatusCounts(): Promise<{
    idle: number;
    busy: number;
    offline: number;
    total: number;
  }> {
    try {
      const result = await this.pool.query<{
        status: AgentStatus;
        count: string;
      }>(
        `
        SELECT status, COUNT(*)::text as count
        FROM agent_pool
        GROUP BY status
        `
      );

      const counts = {
        idle: 0,
        busy: 0,
        offline: 0,
        total: 0,
      };

      for (const row of result.rows) {
        const count = parseInt(row.count, 10);
        counts[row.status] = count;
        counts.total += count;
      }

      return counts;
    } catch (error) {
      console.error('[AgentRegistry] Failed to get status counts:', error);
      throw error;
    }
  }
}
