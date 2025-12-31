/**
 * LangGraph Client Tests
 * ======================
 *
 * Tests for the TypeScript LangGraph client.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  LangGraphClient,
  getLangGraphClient,
  isLangGraphEnabled,
  ConversationRequest,
  ConversationResponse,
  SwarmResponse,
} from './langgraph';

describe('LangGraphClient', () => {
  let client: LangGraphClient;

  beforeEach(() => {
    client = new LangGraphClient({
      httpUrl: 'http://localhost:8000',
      redisUrl: 'redis://localhost:6379',
      channelPrefix: 'test:langgraph:',
      httpTimeout: 5000,
    });
  });

  describe('Configuration', () => {
    it('should use default configuration when not specified', () => {
      const defaultClient = new LangGraphClient();
      expect(defaultClient).toBeDefined();
    });

    it('should merge custom configuration with defaults', () => {
      const customClient = new LangGraphClient({
        httpUrl: 'http://custom:9000',
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('isLangGraphEnabled', () => {
    const originalEnv = process.env.LANGGRAPH_ENABLED;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.LANGGRAPH_ENABLED = originalEnv;
      } else {
        delete process.env.LANGGRAPH_ENABLED;
      }
    });

    it('should return false when LANGGRAPH_ENABLED is not set', () => {
      delete process.env.LANGGRAPH_ENABLED;
      expect(isLangGraphEnabled()).toBe(false);
    });

    it('should return true when LANGGRAPH_ENABLED is "true"', () => {
      process.env.LANGGRAPH_ENABLED = 'true';
      expect(isLangGraphEnabled()).toBe(true);
    });

    it('should return false when LANGGRAPH_ENABLED is "false"', () => {
      process.env.LANGGRAPH_ENABLED = 'false';
      expect(isLangGraphEnabled()).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      // Mock fetch
      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'healthy' }), { status: 200 })
      );

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ method: 'GET' })
      );

      mockFetch.mockRestore();
    });

    it('should return false when service is unhealthy', async () => {
      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response('Service Unavailable', { status: 503 })
      );

      const result = await client.healthCheck();

      expect(result).toBe(false);
      mockFetch.mockRestore();
    });

    it('should return false when fetch throws', async () => {
      const mockFetch = spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
      mockFetch.mockRestore();
    });
  });

  describe('processConversation', () => {
    it('should send correct request and parse response', async () => {
      const mockResponse: ConversationResponse = {
        conversationId: 'test-123',
        threadId: 'thread-abc',
        phase: 'completed',
        responses: ['Hello!', 'How can I help?'],
        error: null,
        durationMs: 1500,
      };

      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            conversation_id: mockResponse.conversationId,
            thread_id: mockResponse.threadId,
            phase: mockResponse.phase,
            responses: mockResponse.responses,
            error: mockResponse.error,
            duration_ms: mockResponse.durationMs,
          }),
          { status: 200 }
        )
      );

      const request: ConversationRequest = {
        conversationId: 'test-123',
        platformType: 'telegram',
        message: 'Hello!',
      };

      const result = await client.processConversation(request);

      expect(result.conversationId).toBe('test-123');
      expect(result.threadId).toBe('thread-abc');
      expect(result.phase).toBe('completed');
      expect(result.responses).toEqual(['Hello!', 'How can I help?']);
      expect(result.durationMs).toBe(1500);

      // Verify request body
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/conversation',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      mockFetch.mockRestore();
    });

    it('should throw error on non-ok response', async () => {
      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      );

      const request: ConversationRequest = {
        conversationId: 'test-123',
        platformType: 'telegram',
        message: 'Hello!',
      };

      await expect(client.processConversation(request)).rejects.toThrow(
        'LangGraph request failed'
      );

      mockFetch.mockRestore();
    });

    it('should include optional fields when provided', async () => {
      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            conversation_id: 'test-123',
            thread_id: 'thread-abc',
            phase: 'completed',
            responses: [],
            error: null,
            duration_ms: 100,
          }),
          { status: 200 }
        )
      );

      const request: ConversationRequest = {
        conversationId: 'test-123',
        platformType: 'github',
        message: 'Fix the bug',
        issueContext: 'Issue #42: Login broken',
        threadContext: 'Previous discussion...',
        threadId: 'existing-thread',
      };

      await client.processConversation(request);

      // Verify the call was made with all fields
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body as string);

      expect(body.issue_context).toBe('Issue #42: Login broken');
      expect(body.thread_context).toBe('Previous discussion...');
      expect(body.thread_id).toBe('existing-thread');

      mockFetch.mockRestore();
    });
  });

  describe('executeSwarm', () => {
    it('should execute swarm and return response', async () => {
      const mockResponse: SwarmResponse = {
        swarmId: 'swarm-xyz',
        status: 'completed',
        summary: 'Task completed successfully',
        agentCount: 3,
        completedCount: 3,
        failedCount: 0,
        durationMs: 5000,
      };

      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            swarm_id: mockResponse.swarmId,
            status: mockResponse.status,
            summary: mockResponse.summary,
            agent_count: mockResponse.agentCount,
            completed_count: mockResponse.completedCount,
            failed_count: mockResponse.failedCount,
            duration_ms: mockResponse.durationMs,
          }),
          { status: 200 }
        )
      );

      const result = await client.executeSwarm({
        conversationId: 'test-123',
        request: 'Build a REST API',
        cwd: '/home/user/project',
      });

      expect(result.swarmId).toBe('swarm-xyz');
      expect(result.status).toBe('completed');
      expect(result.agentCount).toBe(3);
      expect(result.completedCount).toBe(3);
      expect(result.failedCount).toBe(0);

      mockFetch.mockRestore();
    });

    it('should handle failed swarm', async () => {
      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            swarm_id: 'swarm-fail',
            status: 'failed',
            summary: 'Swarm execution failed',
            agent_count: 2,
            completed_count: 1,
            failed_count: 1,
            duration_ms: 2000,
          }),
          { status: 200 }
        )
      );

      const result = await client.executeSwarm({
        conversationId: 'test-123',
        request: 'Complex task',
      });

      expect(result.status).toBe('failed');
      expect(result.failedCount).toBe(1);

      mockFetch.mockRestore();
    });
  });

  describe('getThreadState', () => {
    it('should return thread state when found', async () => {
      const mockState = {
        conversationId: 'test-123',
        phase: 'completed',
        messages: [],
      };

      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ state: mockState }), { status: 200 })
      );

      const result = await client.getThreadState('thread-abc');

      expect(result).toEqual(mockState);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/thread/thread-abc/state');

      mockFetch.mockRestore();
    });

    it('should return null when thread not found', async () => {
      const mockFetch = spyOn(global, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      );

      const result = await client.getThreadState('nonexistent');

      expect(result).toBeNull();

      mockFetch.mockRestore();
    });

    it('should return null on error', async () => {
      const mockFetch = spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await client.getThreadState('thread-abc');

      expect(result).toBeNull();

      mockFetch.mockRestore();
    });
  });

  describe('getLangGraphClient singleton', () => {
    it('should return the same instance', () => {
      const client1 = getLangGraphClient();
      const client2 = getLangGraphClient();

      expect(client1).toBe(client2);
    });
  });
});

describe('LangGraph Adapter', () => {
  // Note: Redis pub/sub tests would require mocking the redis client
  // These are integration tests that should be run with a real Redis instance
});
