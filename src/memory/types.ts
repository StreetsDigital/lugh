/**
 * Memory System Types
 * ===================
 *
 * Based on CAMEL AI memory architecture:
 * - ChatHistoryBlock: Recency-based retrieval
 * - VectorDBBlock: Semantic similarity retrieval
 * - AgentMemory: Unified memory manager
 *
 * @see https://docs.camel-ai.org/key_modules/memory
 */

/**
 * Role in a conversation message
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * A single message in conversation history
 */
export interface MemoryMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * A record stored in memory (can be message, decision, code snippet, etc.)
 */
export interface MemoryRecord {
  id: string;
  conversationId: string;
  content: string;
  embedding?: number[];
  recordType: 'message' | 'decision' | 'code' | 'summary' | 'context';
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Search result from memory retrieval
 */
export interface MemorySearchResult {
  record: MemoryRecord;
  score: number; // Similarity score (0-1) for vector search, recency for chat history
  source: 'chat_history' | 'vector_db';
}

/**
 * Configuration for ChatHistoryBlock
 */
export interface ChatHistoryConfig {
  /** Maximum number of messages to keep in memory */
  maxMessages: number;
  /** Whether to summarize when overflow occurs */
  summarizeOnOverflow: boolean;
  /** Maximum tokens for context window */
  maxTokens?: number;
}

/**
 * Configuration for VectorDBBlock
 */
export interface VectorDBConfig {
  /** Embedding model to use (default: text-embedding-ada-002) */
  embeddingModel: string;
  /** Minimum similarity threshold for retrieval (0-1) */
  similarityThreshold: number;
  /** Maximum number of results to return */
  topK: number;
}

/**
 * Memory block interface - base for all memory implementations
 */
export interface IMemoryBlock {
  /**
   * Write a record to memory
   */
  write(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord>;

  /**
   * Retrieve records from memory
   * @param query - Search query (interpreted differently by each implementation)
   * @param limit - Maximum number of results
   */
  retrieve(query: string, limit?: number): Promise<MemorySearchResult[]>;

  /**
   * Clear all records for a conversation
   */
  clear(conversationId: string): Promise<void>;

  /**
   * Get record count for a conversation
   */
  count(conversationId: string): Promise<number>;
}

/**
 * Chat history block - retrieves by recency
 */
export interface IChatHistoryBlock extends IMemoryBlock {
  config: ChatHistoryConfig;

  /**
   * Add a message to history
   */
  addMessage(conversationId: string, message: Omit<MemoryMessage, 'id'>): Promise<MemoryMessage>;

  /**
   * Get recent messages
   */
  getRecentMessages(conversationId: string, limit?: number): Promise<MemoryMessage[]>;

  /**
   * Summarize conversation history
   */
  summarize(conversationId: string): Promise<string>;
}

/**
 * Vector DB block - retrieves by semantic similarity
 */
export interface IVectorDBBlock extends IMemoryBlock {
  config: VectorDBConfig;

  /**
   * Search by semantic similarity
   */
  search(conversationId: string, query: string, topK?: number): Promise<MemorySearchResult[]>;

  /**
   * Add a record with automatic embedding
   */
  addWithEmbedding(
    record: Omit<MemoryRecord, 'id' | 'createdAt' | 'embedding'>
  ): Promise<MemoryRecord>;
}

/**
 * Unified agent memory interface
 * Combines chat history and vector DB for comprehensive context
 */
export interface IAgentMemory {
  chatHistory: IChatHistoryBlock;
  vectorDB: IVectorDBBlock | null;
  workingMemory: Map<string, unknown>;

  /**
   * Get formatted context for a prompt
   * Combines recent chat history with semantically relevant past context
   */
  getContext(conversationId: string, query: string): Promise<string>;

  /**
   * Add a user message to memory
   */
  addUserMessage(conversationId: string, content: string): Promise<void>;

  /**
   * Add an assistant message to memory
   */
  addAssistantMessage(conversationId: string, content: string): Promise<void>;

  /**
   * Store a decision or important context
   */
  storeDecision(
    conversationId: string,
    decision: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Store a code snippet for later retrieval
   */
  storeCode(
    conversationId: string,
    code: string,
    filePath: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Get or set working memory (task-specific scratchpad)
   */
  getWorkingMemory<T>(key: string): T | undefined;
  setWorkingMemory<T>(key: string, value: T): void;
  clearWorkingMemory(): void;
}

/**
 * Embedding provider interface
 */
export interface IEmbeddingProvider {
  /**
   * Generate embedding for text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get embedding dimensions
   */
  getDimensions(): number;
}

/**
 * Context creator configuration
 */
export interface ContextCreatorConfig {
  /** Maximum tokens for the context */
  maxTokens: number;
  /** Number of recent messages to always include */
  recentMessageCount: number;
  /** Number of semantic search results to include */
  semanticResultCount: number;
  /** Format template for context */
  template?: string;
}
