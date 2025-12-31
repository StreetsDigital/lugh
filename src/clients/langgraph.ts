/**
 * LangGraph Client
 * ================
 *
 * TypeScript client for the Python LangGraph orchestration service.
 * Supports both HTTP and Redis pub/sub communication.
 */

// Redis is dynamically imported to avoid hard dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClientType = any;

/**
 * LangGraph service configuration
 */
export interface LangGraphConfig {
  /** HTTP endpoint for the LangGraph service */
  httpUrl: string;
  /** Redis URL for pub/sub communication */
  redisUrl: string;
  /** Channel prefix for Redis (must match Python service) */
  channelPrefix: string;
  /** Timeout for HTTP requests (ms) */
  httpTimeout: number;
}

/**
 * Conversation request to LangGraph
 */
export interface ConversationRequest {
  conversationId: string;
  platformType: string;
  message: string;
  issueContext?: string;
  threadContext?: string;
  threadId?: string;
}

/**
 * Conversation response from LangGraph
 */
export interface ConversationResponse {
  conversationId: string;
  threadId: string;
  phase: string;
  responses: string[];
  error: string | null;
  durationMs: number;
}

/**
 * Swarm request
 */
export interface SwarmRequest {
  conversationId: string;
  request: string;
  cwd?: string;
}

/**
 * Swarm response
 */
export interface SwarmResponse {
  swarmId: string;
  status: 'completed' | 'failed';
  summary: string;
  agentCount: number;
  completedCount: number;
  failedCount: number;
  durationMs: number;
}

/**
 * Redis event from LangGraph
 */
export interface LangGraphEvent {
  type: string;
  conversationId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Event handler callback
 */
export type EventHandler = (event: LangGraphEvent) => void | Promise<void>;

/**
 * Default configuration
 */
const DEFAULT_CONFIG: LangGraphConfig = {
  httpUrl: process.env.LANGGRAPH_URL ?? 'http://localhost:8000',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  channelPrefix: process.env.LANGGRAPH_CHANNEL_PREFIX ?? 'lugh:langgraph:',
  httpTimeout: 300000, // 5 minutes
};

/**
 * LangGraph Client
 *
 * Provides two modes of operation:
 * 1. HTTP mode: Synchronous requests via fetch
 * 2. Redis mode: Async pub/sub for real-time streaming
 */
export class LangGraphClient {
  private config: LangGraphConfig;
  private redis: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private isConnected = false;

  constructor(config?: Partial<LangGraphConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to Redis for pub/sub
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      // Dynamic import to avoid hard dependency
      const { createClient } = await import('redis');

      // Publisher client
      this.redis = createClient({ url: this.config.redisUrl });
      await this.redis.connect();

      // Subscriber client (separate connection required)
      this.subscriber = this.redis.duplicate();
      await this.subscriber.connect();

      this.isConnected = true;
      console.log('[LangGraphClient] Connected to Redis');
    } catch (error) {
      console.error('[LangGraphClient] Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    this.isConnected = false;
    console.log('[LangGraphClient] Disconnected from Redis');
  }

  /**
   * Check if LangGraph service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.httpUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // HTTP Mode
  // ===========================================================================

  /**
   * Process a conversation via HTTP
   *
   * This is a synchronous request that waits for the full response.
   * Use for simple queries or when streaming isn't needed.
   */
  async processConversation(request: ConversationRequest): Promise<ConversationResponse> {
    const response = await fetch(`${this.config.httpUrl}/conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: request.conversationId,
        platform_type: request.platformType,
        message: request.message,
        issue_context: request.issueContext,
        thread_context: request.threadContext,
        thread_id: request.threadId,
      }),
      signal: AbortSignal.timeout(this.config.httpTimeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LangGraph request failed: ${error}`);
    }

    const data = (await response.json()) as {
      conversation_id: string;
      thread_id: string;
      phase: string;
      responses: string[];
      error?: string;
      duration_ms: number;
    };

    return {
      conversationId: data.conversation_id,
      threadId: data.thread_id,
      phase: data.phase,
      responses: data.responses,
      error: data.error ?? null,
      durationMs: data.duration_ms,
    };
  }

  /**
   * Execute a swarm via HTTP
   */
  async executeSwarm(request: SwarmRequest): Promise<SwarmResponse> {
    const response = await fetch(`${this.config.httpUrl}/swarm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: request.conversationId,
        request: request.request,
        cwd: request.cwd ?? '/home/user',
      }),
      signal: AbortSignal.timeout(this.config.httpTimeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Swarm request failed: ${error}`);
    }

    const data = (await response.json()) as {
      swarm_id: string;
      status: 'completed' | 'failed';
      summary: string;
      agent_count: number;
      completed_count: number;
      failed_count: number;
      duration_ms: number;
    };

    return {
      swarmId: data.swarm_id,
      status: data.status,
      summary: data.summary,
      agentCount: data.agent_count,
      completedCount: data.completed_count,
      failedCount: data.failed_count,
      durationMs: data.duration_ms,
    };
  }

  /**
   * Get thread state for resume
   */
  async getThreadState(threadId: string): Promise<Record<string, unknown> | null> {
    try {
      const response = await fetch(`${this.config.httpUrl}/thread/${threadId}/state`);
      if (!response.ok) return null;
      const data = (await response.json()) as { state: Record<string, unknown> };
      return data.state;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Redis Pub/Sub Mode
  // ===========================================================================

  /**
   * Subscribe to events for a conversation
   *
   * Returns an unsubscribe function.
   */
  async subscribe(conversationId: string, handler: EventHandler): Promise<() => Promise<void>> {
    if (!this.subscriber) {
      await this.connect();
    }

    const responseChannel = `${this.config.channelPrefix}response:${conversationId}`;
    const eventsChannel = `${this.config.channelPrefix}events:${conversationId}`;

    // Track handlers
    const existing = this.eventHandlers.get(conversationId) ?? [];
    existing.push(handler);
    this.eventHandlers.set(conversationId, existing);

    // Subscribe to channels
    const messageHandler = async (message: string, _channel: string): Promise<void> => {
      try {
        const event = JSON.parse(message) as LangGraphEvent;
        const handlers = this.eventHandlers.get(conversationId) ?? [];
        for (const h of handlers) {
          await h(event);
        }
      } catch (error) {
        console.error('[LangGraphClient] Failed to parse event:', error);
      }
    };

    await this.subscriber!.subscribe([responseChannel, eventsChannel], messageHandler);

    console.log(`[LangGraphClient] Subscribed to ${conversationId}`);

    // Return unsubscribe function
    return async (): Promise<void> => {
      const handlers = this.eventHandlers.get(conversationId) ?? [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }

      if (handlers.length === 0) {
        await this.subscriber?.unsubscribe([responseChannel, eventsChannel]);
        this.eventHandlers.delete(conversationId);
      }
    };
  }

  /**
   * Publish a request to LangGraph via Redis
   *
   * Use this for async processing where responses come via pub/sub.
   */
  async publishRequest(request: ConversationRequest): Promise<void> {
    if (!this.redis) {
      await this.connect();
    }

    const channel = `${this.config.channelPrefix}request`;
    const payload = JSON.stringify({
      type: 'request',
      conversation_id: request.conversationId,
      platform_type: request.platformType,
      message: request.message,
      issue_context: request.issueContext,
      thread_context: request.threadContext,
      thread_id: request.threadId,
      timestamp: new Date().toISOString(),
    });

    await this.redis!.publish(channel, payload);
    console.log(`[LangGraphClient] Published request for ${request.conversationId}`);
  }

  /**
   * Send a stop signal to cancel processing
   */
  async sendStop(conversationId: string): Promise<void> {
    if (!this.redis) return;

    const channel = `${this.config.channelPrefix}control`;
    const payload = JSON.stringify({
      type: 'stop',
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
    });

    await this.redis.publish(channel, payload);
    console.log(`[LangGraphClient] Sent stop signal for ${conversationId}`);
  }

  // ===========================================================================
  // Streaming Mode (SSE)
  // ===========================================================================

  /**
   * Stream a conversation via Server-Sent Events
   *
   * This provides real-time updates during graph execution.
   */
  async *streamConversation(
    request: ConversationRequest
  ): AsyncGenerator<LangGraphEvent, void, unknown> {
    const response = await fetch(`${this.config.httpUrl}/conversation/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: request.conversationId,
        platform_type: request.platformType,
        message: request.message,
        issue_context: request.issueContext,
        thread_context: request.threadContext,
        thread_id: request.threadId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              yield {
                type: data.event,
                conversationId: request.conversationId,
                timestamp: new Date().toISOString(),
                data: data.data,
              };
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ===========================================================================
// Singleton Instance
// ===========================================================================

let clientInstance: LangGraphClient | null = null;

/**
 * Get the LangGraph client singleton
 */
export function getLangGraphClient(): LangGraphClient {
  if (!clientInstance) {
    clientInstance = new LangGraphClient();
  }
  return clientInstance;
}

/**
 * Check if LangGraph integration is enabled
 */
export function isLangGraphEnabled(): boolean {
  return process.env.LANGGRAPH_ENABLED === 'true';
}
