/**
 * Memory System
 * ==============
 *
 * CAMEL AI-inspired memory architecture for Lugh.
 *
 * Components:
 * - ChatHistoryBlock: Recency-based retrieval (recent messages)
 * - VectorDBBlock: Semantic similarity retrieval (embeddings)
 * - AgentMemory: Unified memory manager combining both
 *
 * Usage:
 * ```typescript
 * import { getAgentMemory } from './memory';
 *
 * const memory = getAgentMemory();
 *
 * // Add messages
 * await memory.addUserMessage(conversationId, 'Hello');
 * await memory.addAssistantMessage(conversationId, 'Hi there!');
 *
 * // Store decisions for semantic search
 * await memory.storeDecision(conversationId, 'Decided to use PostgreSQL');
 *
 * // Get context for prompts
 * const context = await memory.getContext(conversationId, 'database choice');
 * ```
 */

// Types
export type {
  MessageRole,
  MemoryMessage,
  MemoryRecord,
  MemorySearchResult,
  ChatHistoryConfig,
  VectorDBConfig,
  IMemoryBlock,
  IChatHistoryBlock,
  IVectorDBBlock,
  IAgentMemory,
  IEmbeddingProvider,
  ContextCreatorConfig,
} from './types';

// Chat History Block
export {
  ChatHistoryBlock,
  createChatHistoryBlock,
} from './chat-history-block';

// Vector DB Block
export {
  VectorDBBlock,
  createVectorDBBlock,
} from './vector-db-block';

// Embedding Provider
export {
  OpenAIEmbeddingProvider,
  createEmbeddingProvider,
} from './embedding-provider';

// Agent Memory (unified)
export {
  AgentMemory,
  getAgentMemory,
  createAgentMemory,
} from './agent-memory';
