/**
 * Redis Client (Optional - Preserved for Future Upgrade Path)
 * ============================================================
 *
 * NOTE: This code is preserved but not currently used.
 * The agent pool now uses PostgreSQL NOTIFY/LISTEN (see src/pool/).
 *
 * Redis will be reactivated in FEAT-019 when scaling to 50+ agents
 * or distributing agents across machines. Until then, PostgreSQL
 * handles 3-12 agents easily with lower complexity.
 *
 * Wrapper around Redis connection with typed pub/sub operations.
 * Used by both orchestrator and agents (when FEATURE_REDIS_MESSAGING=true).
 */

import { createClient, RedisClientType } from 'redis';
import { isEnabled } from '../config/features';
import { ORCHESTRATOR_CHANNELS, AGENT_CHANNELS, REDIS_KEYS } from './channels';
import {
  type RedisMessage,
  type OrchestratorMessage,
  type AgentMessage,
  parseMessage,
  serializeMessage,
} from './messages';

// Re-export for convenience
export * from './channels';
export * from './messages';

/**
 * Message handler callback
 */
type MessageHandler<T extends RedisMessage> = (message: T) => void | Promise<void>;

/**
 * Redis client wrapper with typed pub/sub
 */
export class RedisClient {
  private client!: RedisClientType;
  private subscriber!: RedisClientType;
  private isConnected = false;
  private handlers = new Map<string, MessageHandler<RedisMessage>[]>();

  constructor(private url: string = process.env.REDIS_URL || 'redis://localhost:6379') {}

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    // Main client for publishing and data operations
    this.client = createClient({ url: this.url });
    this.client.on('error', (err: Error) => {
      console.error('[Redis] Client error:', err);
    });
    await this.client.connect();

    // Separate client for subscriptions (Redis requirement)
    this.subscriber = this.client.duplicate();
    this.subscriber.on('error', (err: Error) => {
      console.error('[Redis] Subscriber error:', err);
    });
    await this.subscriber.connect();

    this.isConnected = true;
    console.log('[Redis] Connected to', this.url);
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    await this.subscriber.quit();
    await this.client.quit();
    this.isConnected = false;
    console.log('[Redis] Disconnected');
  }

  // =============================================================================
  // PUB/SUB OPERATIONS
  // =============================================================================

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: RedisMessage): Promise<void> {
    const json = serializeMessage(message);
    await this.client.publish(channel, json);
    console.log(`[Redis] Published to ${channel}:`, message.type);
  }

  /**
   * Subscribe to orchestrator channels (for agents)
   */
  async subscribeToOrchestrator(handler: MessageHandler<OrchestratorMessage>): Promise<void> {
    for (const channel of Object.values(ORCHESTRATOR_CHANNELS)) {
      await this.subscribe(channel, handler as MessageHandler<RedisMessage>);
    }
  }

  /**
   * Subscribe to agent channels (for orchestrator)
   */
  async subscribeToAgents(handler: MessageHandler<AgentMessage>): Promise<void> {
    for (const channel of Object.values(AGENT_CHANNELS)) {
      await this.subscribe(channel, handler as MessageHandler<RedisMessage>);
    }
  }

  /**
   * Subscribe to a specific channel
   */
  async subscribe(channel: string, handler: MessageHandler<RedisMessage>): Promise<void> {
    // Track handlers
    const handlers = this.handlers.get(channel) || [];
    handlers.push(handler);
    this.handlers.set(channel, handlers);

    // Subscribe if first handler
    if (handlers.length === 1) {
      await this.subscriber.subscribe(channel, (json: string) => {
        try {
          const message = parseMessage(json);
          const channelHandlers = this.handlers.get(channel) || [];
          for (const h of channelHandlers) {
            h(message);
          }
        } catch (err) {
          console.error(`[Redis] Failed to parse message on ${channel}:`, err);
        }
      });
      console.log(`[Redis] Subscribed to ${channel}`);
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
    this.handlers.delete(channel);
    console.log(`[Redis] Unsubscribed from ${channel}`);
  }

  // =============================================================================
  // DATA OPERATIONS
  // =============================================================================

  /**
   * Set agent info
   */
  async setAgentInfo(agentId: string, info: Record<string, string>): Promise<void> {
    const key = `${REDIS_KEYS.AGENT}:${agentId}`;
    await this.client.hSet(key, info);
  }

  /**
   * Get agent info
   */
  async getAgentInfo(agentId: string): Promise<Record<string, string>> {
    const key = `${REDIS_KEYS.AGENT}:${agentId}`;
    return await this.client.hGetAll(key);
  }

  /**
   * Set task info
   */
  async setTaskInfo(taskId: string, info: Record<string, string>): Promise<void> {
    const key = `${REDIS_KEYS.TASK}:${taskId}`;
    await this.client.hSet(key, info);
  }

  /**
   * Get task info
   */
  async getTaskInfo(taskId: string): Promise<Record<string, string>> {
    const key = `${REDIS_KEYS.TASK}:${taskId}`;
    return await this.client.hGetAll(key);
  }

  /**
   * Add agent to active set
   */
  async addActiveAgent(agentId: string): Promise<void> {
    await this.client.sAdd(REDIS_KEYS.ACTIVE_AGENTS, agentId);
  }

  /**
   * Remove agent from active set
   */
  async removeActiveAgent(agentId: string): Promise<void> {
    await this.client.sRem(REDIS_KEYS.ACTIVE_AGENTS, agentId);
  }

  /**
   * Get all active agents
   */
  async getActiveAgents(): Promise<string[]> {
    return await this.client.sMembers(REDIS_KEYS.ACTIVE_AGENTS);
  }

  /**
   * Add task to queue with priority
   */
  async queueTask(taskId: string, priority: number): Promise<void> {
    await this.client.zAdd(REDIS_KEYS.TASK_QUEUE, {
      score: priority,
      value: taskId,
    });
  }

  /**
   * Get next task from queue
   */
  async dequeueTask(): Promise<string | null> {
    const result = await this.client.zPopMax(REDIS_KEYS.TASK_QUEUE);
    return result?.value || null;
  }

  /**
   * Get queue length
   */
  async getQueueLength(): Promise<number> {
    return await this.client.zCard(REDIS_KEYS.TASK_QUEUE);
  }

  /**
   * Acquire lock for agent assignment (prevents race conditions)
   */
  async acquireAgentLock(agentId: string, ttlMs = 30000): Promise<boolean> {
    const key = `${REDIS_KEYS.AGENT_LOCK}:${agentId}`;
    const result = await this.client.set(key, 'locked', {
      NX: true,
      PX: ttlMs,
    });
    return result === 'OK';
  }

  /**
   * Release agent lock
   */
  async releaseAgentLock(agentId: string): Promise<void> {
    const key = `${REDIS_KEYS.AGENT_LOCK}:${agentId}`;
    await this.client.del(key);
  }

  // =============================================================================
  // CONVENIENCE METHODS
  // =============================================================================

  /**
   * Dispatch a task to agents
   */
  async dispatchTask(message: OrchestratorMessage & { type: 'task:dispatch' }): Promise<void> {
    await this.publish(ORCHESTRATOR_CHANNELS.TASK_DISPATCH, message);
  }

  /**
   * Send stop command to agent
   */
  async stopAgent(agentId: string, taskId: string, reason: string): Promise<void> {
    await this.publish(ORCHESTRATOR_CHANNELS.CONTROL_STOP, {
      type: 'control:stop',
      agentId,
      taskId,
      reason,
      graceful: true,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send kill command to agent
   */
  async killAgent(agentId: string, reason: string): Promise<void> {
    await this.publish(ORCHESTRATOR_CHANNELS.CONTROL_KILL, {
      type: 'control:kill',
      agentId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }
}

// Singleton instance
let redisClient: RedisClient | null = null;

/**
 * Get or create Redis client singleton
 * Throws error if REDIS_MESSAGING feature is not enabled
 */
export function getRedisClient(): RedisClient {
  if (!isEnabled('REDIS_MESSAGING')) {
    throw new Error(
      '[Redis] REDIS_MESSAGING feature is not enabled. ' +
        'Set FEATURE_REDIS_MESSAGING=true in your environment to use Redis.'
    );
  }
  if (!redisClient) {
    redisClient = new RedisClient();
  }
  return redisClient;
}

/**
 * Initialize Redis if REDIS_MESSAGING feature is enabled
 * Safe to call during app startup - returns null if feature disabled
 */
export async function initRedis(): Promise<RedisClient | null> {
  if (!isEnabled('REDIS_MESSAGING')) {
    console.log('[Redis] REDIS_MESSAGING feature disabled, skipping initialization');
    return null;
  }
  const client = getRedisClient();
  await client.connect();
  console.log('[Redis] Connected successfully');
  return client;
}
