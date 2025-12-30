/**
 * Unit tests for PostgreSQL Pub/Sub
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Pool } from 'pg';
import { PgPubSub } from './pubsub';

describe('PgPubSub', () => {
  let pool: Pool;
  let pubsub: PgPubSub;

  beforeEach(() => {
    // Use test database
    pool = new Pool({
      connectionString:
        process.env.TEST_DATABASE_URL ||
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/lugh_test',
    });
    pubsub = new PgPubSub(pool);
  });

  afterEach(async () => {
    await pubsub.shutdown();
    await pool.end();
  });

  describe('publish', () => {
    test('should publish a message to a channel', async () => {
      const channel = 'test_channel';
      const payload = { message: 'hello world', timestamp: Date.now() };

      // Should not throw
      await expect(pubsub.publish(channel, payload)).resolves.toBeUndefined();
    });

    test('should handle large payloads gracefully', async () => {
      const channel = 'test_large';
      const largePayload = {
        data: 'x'.repeat(10000), // 10KB payload
      };

      // Should warn but still work
      await expect(pubsub.publish(channel, largePayload)).resolves.toBeUndefined();
    });

    test('should handle empty payloads', async () => {
      const channel = 'test_empty';
      const payload = {};

      await expect(pubsub.publish(channel, payload)).resolves.toBeUndefined();
    });
  });

  describe('subscribe', () => {
    test('should subscribe to a channel and receive messages', async () => {
      const channel = 'test_subscribe';
      const payload = { message: 'test', value: 42 };
      let received: unknown = null;

      const handler = (msg: unknown) => {
        received = msg;
      };

      await pubsub.subscribe(channel, handler);

      // Give subscription time to register
      await new Promise((resolve) => setTimeout(resolve, 100));

      await pubsub.publish(channel, payload);

      // Wait for message delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received).toEqual(payload);
    });

    test('should support multiple handlers on same channel', async () => {
      const channel = 'test_multi';
      const payload = { count: 1 };
      const received: unknown[] = [];

      const handler1 = (msg: unknown) => received.push({ handler: 1, msg });
      const handler2 = (msg: unknown) => received.push({ handler: 2, msg });

      await pubsub.subscribe(channel, handler1);
      await pubsub.subscribe(channel, handler2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      await pubsub.publish(channel, payload);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received.length).toBe(2);
      expect(received[0]).toEqual({ handler: 1, msg: payload });
      expect(received[1]).toEqual({ handler: 2, msg: payload });
    });

    test('should sanitize channel names', async () => {
      const channel = 'test-channel-with-special-chars!@#$%';
      const payload = { test: true };
      let received: unknown = null;

      await pubsub.subscribe(channel, (msg) => {
        received = msg;
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should work despite special characters
      await pubsub.publish(channel, payload);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received).toEqual(payload);
    });
  });

  describe('unsubscribe', () => {
    test('should unsubscribe a specific handler', async () => {
      const channel = 'test_unsub';
      const payload = { value: 1 };
      let count = 0;

      const handler = () => {
        count++;
      };

      await pubsub.subscribe(channel, handler);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // First message should be received
      await pubsub.publish(channel, payload);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(count).toBe(1);

      // Unsubscribe
      await pubsub.unsubscribe(channel, handler);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second message should NOT be received
      await pubsub.publish(channel, payload);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(count).toBe(1); // Still 1, not 2
    });

    test('should close channel when all handlers unsubscribed', async () => {
      const channel = 'test_close';

      await pubsub.subscribe(channel, () => {});
      expect(pubsub.getActiveChannels()).toContain(channel);

      await pubsub.unsubscribe(channel);
      expect(pubsub.getActiveChannels()).not.toContain(channel);
    });
  });

  describe('getActiveChannels', () => {
    test('should return list of active channels', async () => {
      await pubsub.subscribe('channel1', () => {});
      await pubsub.subscribe('channel2', () => {});

      const channels = pubsub.getActiveChannels();
      expect(channels).toContain('channel1');
      expect(channels).toContain('channel2');
      expect(channels.length).toBe(2);
    });

    test('should return empty array when no subscriptions', () => {
      const channels = pubsub.getActiveChannels();
      expect(channels).toEqual([]);
    });
  });

  describe('getHandlerCount', () => {
    test('should return number of handlers for a channel', async () => {
      const channel = 'test_count';

      expect(pubsub.getHandlerCount(channel)).toBe(0);

      await pubsub.subscribe(channel, () => {});
      expect(pubsub.getHandlerCount(channel)).toBe(1);

      await pubsub.subscribe(channel, () => {});
      expect(pubsub.getHandlerCount(channel)).toBe(2);
    });
  });

  describe('shutdown', () => {
    test('should close all subscriptions', async () => {
      await pubsub.subscribe('ch1', () => {});
      await pubsub.subscribe('ch2', () => {});

      expect(pubsub.getActiveChannels().length).toBe(2);

      await pubsub.shutdown();

      expect(pubsub.getActiveChannels().length).toBe(0);
    });

    test('should prevent new subscriptions after shutdown', async () => {
      await pubsub.shutdown();

      await expect(pubsub.subscribe('test', () => {})).rejects.toThrow();
    });
  });
});
