/**
 * LangGraph Adapter
 * =================
 *
 * Adapts the LangGraph Python service to work with the existing
 * orchestrator infrastructure. Provides the same interface as
 * the Claude Code client but routes through LangGraph.
 */

import {
  getLangGraphClient,
  isLangGraphEnabled,
  LangGraphClient,
  LangGraphEvent,
} from '../clients/langgraph';
import { IPlatformAdapter, MessageChunk, Conversation, Codebase } from '../types';
import { verbose } from '../utils/logger';

/**
 * Configuration for LangGraph routing
 */
export interface LangGraphRoutingConfig {
  /** Use LangGraph for swarm requests */
  useForSwarm: boolean;
  /** Use LangGraph for regular AI queries */
  useForAI: boolean;
  /** Use LangGraph for command templates */
  useForCommands: boolean;
  /** Stream mode: 'http' for sync, 'redis' for async, 'sse' for streaming */
  streamMode: 'http' | 'redis' | 'sse';
}

/**
 * Default routing configuration
 */
const _DEFAULT_ROUTING_CONFIG: LangGraphRoutingConfig = {
  useForSwarm: true,
  useForAI: false, // Start conservative - only swarm
  useForCommands: false,
  streamMode: 'http',
};

/**
 * Get routing configuration from environment
 */
export function getLangGraphRoutingConfig(): LangGraphRoutingConfig {
  if (!isLangGraphEnabled()) {
    return {
      useForSwarm: false,
      useForAI: false,
      useForCommands: false,
      streamMode: 'http',
    };
  }

  return {
    useForSwarm: process.env.LANGGRAPH_USE_FOR_SWARM !== 'false',
    useForAI: process.env.LANGGRAPH_USE_FOR_AI === 'true',
    useForCommands: process.env.LANGGRAPH_USE_FOR_COMMANDS === 'true',
    streamMode: (process.env.LANGGRAPH_STREAM_MODE as 'http' | 'redis' | 'sse') ?? 'http',
  };
}

/**
 * Check if a request should be routed to LangGraph
 */
export function shouldUseLangGraph(
  requestType: 'swarm' | 'ai' | 'command',
  config?: LangGraphRoutingConfig
): boolean {
  if (!isLangGraphEnabled()) return false;

  const routingConfig = config ?? getLangGraphRoutingConfig();

  switch (requestType) {
    case 'swarm':
      return routingConfig.useForSwarm;
    case 'ai':
      return routingConfig.useForAI;
    case 'command':
      return routingConfig.useForCommands;
    default:
      return false;
  }
}

/**
 * Process a message through LangGraph with streaming to platform
 */
export async function processWithLangGraph(
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  options: {
    conversation: Conversation;
    codebase: Codebase | null;
    cwd: string;
    issueContext?: string;
    threadContext?: string;
    threadId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const client = getLangGraphClient();
  const config = getLangGraphRoutingConfig();

  verbose('LangGraphAdapter', 'Processing message', {
    conversationId,
    streamMode: config.streamMode,
    messageLength: message.length,
  });

  try {
    switch (config.streamMode) {
      case 'http':
        return await processWithHttp(client, platform, conversationId, message, options);

      case 'sse':
        return await processWithSSE(client, platform, conversationId, message, options);

      case 'redis':
        return await processWithRedis(client, platform, conversationId, message, options);

      default:
        return await processWithHttp(client, platform, conversationId, message, options);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LangGraphAdapter] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Process via HTTP (synchronous)
 */
async function processWithHttp(
  client: LangGraphClient,
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  options: {
    conversation: Conversation;
    codebase: Codebase | null;
    cwd: string;
    issueContext?: string;
    threadContext?: string;
    threadId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const response = await client.processConversation({
    conversationId,
    platformType: platform.getPlatformType(),
    message,
    issueContext: options.issueContext,
    threadContext: options.threadContext,
    threadId: options.threadId,
  });

  if (response.error) {
    await platform.sendMessage(conversationId, `Error: ${response.error}`);
    return { success: false, error: response.error };
  }

  // Send all responses to platform
  for (const msg of response.responses) {
    await platform.sendMessage(conversationId, msg);
  }

  return { success: true };
}

/**
 * Process via SSE (streaming)
 */
async function processWithSSE(
  client: LangGraphClient,
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  options: {
    conversation: Conversation;
    codebase: Codebase | null;
    cwd: string;
    issueContext?: string;
    threadContext?: string;
    threadId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const streamingMode = platform.getStreamingMode();
  let accumulatedResponse = '';

  for await (const event of client.streamConversation({
    conversationId,
    platformType: platform.getPlatformType(),
    message,
    issueContext: options.issueContext,
    threadContext: options.threadContext,
    threadId: options.threadId,
  })) {
    // Handle different event types
    if (event.type === 'node_update') {
      const update = event.data.update as Record<string, unknown>;

      // Check for direct response
      if (update.direct_response) {
        if (streamingMode === 'stream') {
          await platform.sendMessage(conversationId, update.direct_response as string);
        } else {
          accumulatedResponse = update.direct_response as string;
        }
      }

      // Check for AI response in messages
      if (update.messages && Array.isArray(update.messages)) {
        for (const msg of update.messages) {
          if (msg.type === 'ai' && msg.content) {
            if (streamingMode === 'stream') {
              await platform.sendMessage(conversationId, msg.content as string);
            } else {
              accumulatedResponse = msg.content as string;
            }
          }
        }
      }

      // Check for phase updates
      if (update.phase && streamingMode === 'stream') {
        verbose('LangGraphAdapter', `Phase: ${update.phase as string}`);
      }
    } else if (event.type === 'error') {
      const error = (event.data as Record<string, unknown>).error as string;
      await platform.sendMessage(conversationId, `Error: ${error}`);
      return { success: false, error };
    }
  }

  // Send accumulated response in batch mode
  if (streamingMode === 'batch' && accumulatedResponse) {
    await platform.sendMessage(conversationId, accumulatedResponse);
  }

  return { success: true };
}

/**
 * Process via Redis pub/sub (async)
 */
async function processWithRedis(
  client: LangGraphClient,
  platform: IPlatformAdapter,
  conversationId: string,
  message: string,
  options: {
    conversation: Conversation;
    codebase: Codebase | null;
    cwd: string;
    issueContext?: string;
    threadContext?: string;
    threadId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: 'LangGraph request timed out' });
      }
    }, 300000); // 5 minute timeout

    // Subscribe to responses
    const unsubscribe = await client.subscribe(conversationId, async (event: LangGraphEvent) => {
      if (event.type === 'response') {
        const data = event.data as Record<string, unknown>;
        if (data.message) {
          await platform.sendMessage(conversationId, data.message as string);
        }
      } else if (event.type === 'ai_chunk') {
        // Stream chunks in stream mode
        if (platform.getStreamingMode() === 'stream') {
          const data = event.data as Record<string, unknown>;
          if (data.chunk) {
            await platform.sendMessage(conversationId, data.chunk as string);
          }
        }
      } else if (event.type === 'ai_complete' || event.type === 'command_complete') {
        // Cleanup on completion
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          await unsubscribe();
          resolve({ success: true });
        }
      } else if (event.type === 'error' || event.type === 'ai_error') {
        const data = event.data as Record<string, unknown>;
        const error = data.error as string;
        await platform.sendMessage(conversationId, `Error: ${error}`);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          await unsubscribe();
          resolve({ success: false, error });
        }
      }
    });

    // Publish request
    await client.publishRequest({
      conversationId,
      platformType: platform.getPlatformType(),
      message,
      issueContext: options.issueContext,
      threadContext: options.threadContext,
      threadId: options.threadId,
    });
  });
}

/**
 * Execute a swarm request through LangGraph
 */
export async function executeSwarmWithLangGraph(
  platform: IPlatformAdapter,
  conversationId: string,
  request: string,
  cwd: string
): Promise<{ success: boolean; summary?: string; error?: string }> {
  const client = getLangGraphClient();

  try {
    // Send "starting" message
    await platform.sendMessage(conversationId, '🐝 Starting swarm execution via LangGraph...');

    const response = await client.executeSwarm({
      conversationId,
      request,
      cwd,
    });

    // Send summary
    await platform.sendMessage(conversationId, response.summary);

    // Send stats
    const stats = `\n📊 **Stats:** ${response.completedCount}/${response.agentCount} agents completed in ${response.durationMs}ms`;
    await platform.sendMessage(conversationId, stats);

    return {
      success: response.status === 'completed',
      summary: response.summary,
      error: response.status === 'failed' ? 'Swarm execution failed' : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await platform.sendMessage(conversationId, `❌ Swarm error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Generator that yields MessageChunks from LangGraph
 * Compatible with existing streaming interface
 */
export async function* streamFromLangGraph(
  message: string,
  options: {
    conversationId: string;
    platformType: string;
    cwd: string;
    issueContext?: string;
    threadContext?: string;
  }
): AsyncGenerator<MessageChunk> {
  const client = getLangGraphClient();

  for await (const event of client.streamConversation({
    conversationId: options.conversationId,
    platformType: options.platformType,
    message,
    issueContext: options.issueContext,
    threadContext: options.threadContext,
  })) {
    if (event.type === 'node_update') {
      const update = event.data.update as Record<string, unknown>;

      // Convert to MessageChunk format
      if (update.direct_response) {
        yield {
          type: 'assistant',
          content: update.direct_response as string,
        };
      }

      if (update.messages && Array.isArray(update.messages)) {
        for (const msg of update.messages) {
          if (msg.type === 'ai' && msg.content) {
            yield {
              type: 'assistant',
              content: msg.content as string,
            };
          }
        }
      }

      // Yield phase as system message
      if (update.phase) {
        yield {
          type: 'system',
          content: `Phase: ${update.phase as string}`,
        };
      }
    } else if (event.type === 'error') {
      yield {
        type: 'system',
        content: `Error: ${(event.data as Record<string, unknown>).error as string}`,
      };
    }
  }
}
