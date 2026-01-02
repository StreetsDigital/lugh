/**
 * Agent Memory
 * =============
 *
 * Unified memory manager combining chat history and vector DB.
 * Provides a single interface for all memory operations.
 *
 * Based on CAMEL AI's LongtermAgentMemory pattern.
 */

import type {
  IAgentMemory,
  IChatHistoryBlock,
  IVectorDBBlock,
  ContextCreatorConfig,
} from './types';
import { createChatHistoryBlock } from './chat-history-block';
import { VectorDBBlock, createVectorDBBlock } from './vector-db-block';

const DEFAULT_CONTEXT_CONFIG: ContextCreatorConfig = {
  maxTokens: 8000,
  recentMessageCount: 10,
  semanticResultCount: 5,
  template: `## Conversation Context

### Recent Conversation
{recentMessages}

### Relevant Past Context
{semanticResults}`,
};

/**
 * AgentMemory - Unified memory manager
 */
export class AgentMemory implements IAgentMemory {
  chatHistory: IChatHistoryBlock;
  vectorDB: IVectorDBBlock | null;
  workingMemory = new Map<string, unknown>();

  private contextConfig: ContextCreatorConfig;

  constructor(options?: {
    chatHistory?: IChatHistoryBlock;
    vectorDB?: IVectorDBBlock | null;
    contextConfig?: Partial<ContextCreatorConfig>;
    enableVectorDB?: boolean;
  }) {
    this.chatHistory = options?.chatHistory || createChatHistoryBlock();

    // Vector DB is optional - only create if explicitly enabled or embeddings available
    const enableVector = options?.enableVectorDB ?? Boolean(process.env.OPENAI_API_KEY);
    this.vectorDB = options?.vectorDB !== undefined
      ? options.vectorDB
      : (enableVector ? createVectorDBBlock() : null);

    this.contextConfig = { ...DEFAULT_CONTEXT_CONFIG, ...options?.contextConfig };

    if (!this.vectorDB) {
      console.log(
        '[AgentMemory] Vector DB disabled (set OPENAI_API_KEY for semantic search)'
      );
    }
  }

  /**
   * Get formatted context for a prompt
   * Combines recent chat history with semantically relevant past context
   */
  async getContext(conversationId: string, query: string): Promise<string> {
    // Get recent messages
    const recentMessages = await this.chatHistory.getRecentMessages(
      conversationId,
      this.contextConfig.recentMessageCount
    );

    const recentFormatted = recentMessages.length > 0
      ? recentMessages
          .map((m) => `**${m.role}**: ${m.content}`)
          .join('\n\n')
      : '_No recent messages_';

    // Get semantic results if vector DB is available
    let semanticFormatted = '_Semantic search not available_';

    if (this.vectorDB) {
      try {
        const semanticResults = await this.vectorDB.search(
          conversationId,
          query,
          this.contextConfig.semanticResultCount
        );

        if (semanticResults.length > 0) {
          semanticFormatted = semanticResults
            .map((r) => {
              const typeLabel = r.record.recordType === 'code'
                ? `[Code: ${r.record.metadata?.filePath || 'unknown'}]`
                : r.record.recordType === 'decision'
                  ? '[Decision]'
                  : '[Context]';
              return `${typeLabel} (relevance: ${(r.score * 100).toFixed(0)}%)\n${r.record.content}`;
            })
            .join('\n\n---\n\n');
        } else {
          semanticFormatted = '_No relevant past context found_';
        }
      } catch (error) {
        console.warn('[AgentMemory] Semantic search failed:', error);
        semanticFormatted = '_Semantic search failed_';
      }
    }

    // Apply template
    return this.contextConfig.template!
      .replace('{recentMessages}', recentFormatted)
      .replace('{semanticResults}', semanticFormatted);
  }

  /**
   * Add a user message to memory
   */
  async addUserMessage(conversationId: string, content: string): Promise<void> {
    await this.chatHistory.addMessage(conversationId, {
      role: 'user',
      content,
      timestamp: new Date(),
    });

    // Also add to vector DB for semantic search
    if (this.vectorDB) {
      try {
        await this.vectorDB.addWithEmbedding({
          conversationId,
          content,
          recordType: 'message',
          metadata: { role: 'user' },
        });
      } catch (error) {
        console.warn('[AgentMemory] Failed to add to vector DB:', error);
      }
    }
  }

  /**
   * Add an assistant message to memory
   */
  async addAssistantMessage(conversationId: string, content: string): Promise<void> {
    await this.chatHistory.addMessage(conversationId, {
      role: 'assistant',
      content,
      timestamp: new Date(),
    });

    // Also add to vector DB for semantic search
    if (this.vectorDB) {
      try {
        await this.vectorDB.addWithEmbedding({
          conversationId,
          content,
          recordType: 'message',
          metadata: { role: 'assistant' },
        });
      } catch (error) {
        console.warn('[AgentMemory] Failed to add to vector DB:', error);
      }
    }
  }

  /**
   * Store a decision or important context
   */
  async storeDecision(
    conversationId: string,
    decision: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.vectorDB) {
      console.warn('[AgentMemory] Vector DB not available, decision not stored for semantic search');
      return;
    }

    await this.vectorDB.addWithEmbedding({
      conversationId,
      content: decision,
      recordType: 'decision',
      metadata: metadata || {},
    });
  }

  /**
   * Store a code snippet for later retrieval
   */
  async storeCode(
    conversationId: string,
    code: string,
    filePath: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.vectorDB) {
      console.warn('[AgentMemory] Vector DB not available, code not stored for semantic search');
      return;
    }

    await (this.vectorDB as VectorDBBlock).storeCode(
      conversationId,
      code,
      filePath,
      metadata?.language as string | undefined
    );
  }

  /**
   * Get working memory value
   */
  getWorkingMemory<T>(key: string): T | undefined {
    return this.workingMemory.get(key) as T | undefined;
  }

  /**
   * Set working memory value
   */
  setWorkingMemory<T>(key: string, value: T): void {
    this.workingMemory.set(key, value);
  }

  /**
   * Clear all working memory
   */
  clearWorkingMemory(): void {
    this.workingMemory.clear();
  }

  /**
   * Clear all memory for a conversation
   */
  async clearAll(conversationId: string): Promise<void> {
    await this.chatHistory.clear(conversationId);
    if (this.vectorDB) {
      await this.vectorDB.clear(conversationId);
    }
    this.workingMemory.clear();
  }

  /**
   * Get conversation summary
   */
  async getSummary(conversationId: string): Promise<string> {
    return this.chatHistory.summarize(conversationId);
  }

  /**
   * Get memory statistics
   */
  async getStats(conversationId: string): Promise<{
    chatHistoryCount: number;
    vectorDBCount: number;
    workingMemoryKeys: string[];
  }> {
    const chatHistoryCount = await this.chatHistory.count(conversationId);
    const vectorDBCount = this.vectorDB
      ? await this.vectorDB.count(conversationId)
      : 0;

    return {
      chatHistoryCount,
      vectorDBCount,
      workingMemoryKeys: Array.from(this.workingMemory.keys()),
    };
  }
}

// Singleton instance for shared memory across the application
let defaultMemory: AgentMemory | null = null;

/**
 * Get the default AgentMemory instance (singleton)
 */
export function getAgentMemory(): AgentMemory {
  if (!defaultMemory) {
    defaultMemory = new AgentMemory();
  }
  return defaultMemory;
}

/**
 * Create a new AgentMemory instance
 */
export function createAgentMemory(options?: {
  chatHistory?: IChatHistoryBlock;
  vectorDB?: IVectorDBBlock | null;
  contextConfig?: Partial<ContextCreatorConfig>;
  enableVectorDB?: boolean;
}): AgentMemory {
  return new AgentMemory(options);
}
