/**
 * PostgreSQL NOTIFY/LISTEN Pub/Sub Wrapper
 *
 * Provides Redis-like pub/sub functionality using PostgreSQL's native NOTIFY/LISTEN.
 * Suitable for 3-12 agents in a single process. For distributed systems at scale,
 * migrate to Redis (see FEAT-019).
 */

import { Pool, PoolClient } from 'pg';

type MessageHandler = (payload: unknown) => void | Promise<void>;

export class PgPubSub {
  private subscriptions = new Map<string, PoolClient>();
  private handlers = new Map<string, Set<MessageHandler>>();
  private isShuttingDown = false;

  constructor(private pool: Pool) {}

  /**
   * Publish a message to a channel
   *
   * Note: PostgreSQL NOTIFY has an 8KB payload limit. For larger payloads,
   * send only the ID and fetch the full data from the database.
   */
  async publish(channel: string, payload: unknown): Promise<void> {
    if (this.isShuttingDown) {
      console.warn('[PgPubSub] Cannot publish during shutdown');
      return;
    }

    try {
      const json = JSON.stringify(payload);

      // Check payload size (NOTIFY limit is 8000 bytes)
      if (Buffer.byteLength(json, 'utf8') > 7900) {
        console.warn(
          `[PgPubSub] Payload for channel '${channel}' is large (${Buffer.byteLength(json)} bytes). ` +
            'Consider sending only IDs and fetching full data from database.'
        );
      }

      await this.pool.query('SELECT pg_notify($1, $2)', [channel, json]);
    } catch (error) {
      console.error(`[PgPubSub] Failed to publish to channel '${channel}':`, error);
      throw error;
    }
  }

  /**
   * Subscribe to a channel with a message handler
   *
   * Multiple handlers can subscribe to the same channel.
   * Each subscription uses a dedicated PostgreSQL connection.
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('[PgPubSub] Cannot subscribe during shutdown');
    }

    try {
      // Get or create client for this channel
      let client = this.subscriptions.get(channel);

      if (!client) {
        // Create dedicated connection for LISTEN
        client = await this.pool.connect();
        await client.query(`LISTEN ${this.sanitizeChannel(channel)}`);

        // Set up notification handler
        client.on('notification', msg => {
          if (msg.channel === channel && msg.payload) {
            try {
              const payload = JSON.parse(msg.payload);
              const handlers = this.handlers.get(channel);

              if (handlers) {
                // Call all handlers for this channel
                for (const h of handlers) {
                  Promise.resolve(h(payload)).catch(err => {
                    console.error(`[PgPubSub] Handler error for channel '${channel}':`, err);
                  });
                }
              }
            } catch (error) {
              console.error(
                `[PgPubSub] Failed to parse notification from channel '${channel}':`,
                error
              );
            }
          }
        });

        client.on('error', err => {
          console.error(`[PgPubSub] Client error for channel '${channel}':`, err);
          // Attempt to reconnect
          this.handleClientError(channel);
        });

        this.subscriptions.set(channel, client);
      }

      // Add handler to set
      if (!this.handlers.has(channel)) {
        this.handlers.set(channel, new Set());
      }
      this.handlers.get(channel)!.add(handler);

      console.log(`[PgPubSub] Subscribed to channel '${channel}'`);
    } catch (error) {
      console.error(`[PgPubSub] Failed to subscribe to channel '${channel}':`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe a specific handler from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    const handlers = this.handlers.get(channel);

    if (handler && handlers) {
      handlers.delete(handler);

      // If no more handlers, close the connection
      if (handlers.size === 0) {
        await this.closeChannel(channel);
      }
    } else {
      // No specific handler provided, close entire channel
      await this.closeChannel(channel);
    }
  }

  /**
   * Close a channel and release its connection
   */
  private async closeChannel(channel: string): Promise<void> {
    const client = this.subscriptions.get(channel);

    if (client) {
      try {
        await client.query(`UNLISTEN ${this.sanitizeChannel(channel)}`);
        client.removeAllListeners();
        client.release();
        this.subscriptions.delete(channel);
        this.handlers.delete(channel);
        console.log(`[PgPubSub] Unsubscribed from channel '${channel}'`);
      } catch (error) {
        console.error(`[PgPubSub] Error closing channel '${channel}':`, error);
      }
    }
  }

  /**
   * Handle client connection errors with reconnection logic
   */
  private async handleClientError(channel: string): Promise<void> {
    if (this.isShuttingDown) return;

    console.warn(`[PgPubSub] Attempting to reconnect channel '${channel}'`);

    // Close existing connection
    await this.closeChannel(channel);

    // Resubscribe all handlers
    const handlers = this.handlers.get(channel);
    if (handlers && handlers.size > 0) {
      // Store handlers temporarily
      const handlersArray = Array.from(handlers);
      this.handlers.delete(channel);

      // Resubscribe each handler
      for (const handler of handlersArray) {
        try {
          await this.subscribe(channel, handler);
        } catch (error) {
          console.error(`[PgPubSub] Failed to resubscribe handler to '${channel}':`, error);
        }
      }
    }
  }

  /**
   * Sanitize channel name to prevent SQL injection
   */
  private sanitizeChannel(channel: string): string {
    // Only allow alphanumeric characters, underscores, and hyphens
    return channel.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Get list of active channels
   */
  getActiveChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get subscription count for a channel
   */
  getHandlerCount(channel: string): number {
    return this.handlers.get(channel)?.size || 0;
  }

  /**
   * Shutdown and release all connections
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.log('[PgPubSub] Shutting down...');

    const channels = Array.from(this.subscriptions.keys());

    for (const channel of channels) {
      await this.closeChannel(channel);
    }

    console.log('[PgPubSub] Shutdown complete');
  }
}
