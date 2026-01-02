/**
 * Chat History Block
 * ==================
 *
 * Recency-based memory retrieval.
 * Stores recent messages and retrieves by FIFO order.
 *
 * Based on CAMEL AI's ChatHistoryMemory pattern.
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection';
import { LLMProvider, createProvider } from '../llm/providers';
import type {
  IChatHistoryBlock,
  ChatHistoryConfig,
  MemoryRecord,
  MemoryMessage,
  MemorySearchResult,
} from './types';

const DEFAULT_CONFIG: ChatHistoryConfig = {
  maxMessages: 50,
  summarizeOnOverflow: true,
  maxTokens: 8000,
};

/**
 * ChatHistoryBlock implementation using PostgreSQL
 */
export class ChatHistoryBlock implements IChatHistoryBlock {
  config: ChatHistoryConfig;
  private llm: LLMProvider | null = null;

  constructor(config?: Partial<ChatHistoryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create LLM provider for summarization
   */
  private getLLM(): LLMProvider {
    if (!this.llm) {
      // Try Claude first, fall back to OpenAI
      try {
        this.llm = createProvider('claude');
        if (!this.llm.isAvailable()) {
          this.llm = createProvider('openai');
        }
      } catch {
        this.llm = createProvider('openai');
      }
    }
    return this.llm;
  }

  /**
   * Write a record to chat history
   */
  async write(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord> {
    const id = uuidv4();
    const createdAt = new Date();

    await pool.query(
      `INSERT INTO memory_records
       (id, conversation_id, content, record_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        record.conversationId,
        record.content,
        record.recordType,
        JSON.stringify(record.metadata),
        createdAt,
      ]
    );

    // Check if we need to prune old messages
    const count = await this.count(record.conversationId);
    if (count > this.config.maxMessages) {
      await this.pruneOldMessages(record.conversationId);
    }

    return {
      id,
      ...record,
      createdAt,
    };
  }

  /**
   * Retrieve records by recency
   */
  async retrieve(query: string, limit?: number): Promise<MemorySearchResult[]> {
    // For chat history, query is the conversation ID
    const messages = await this.getRecentMessages(query, limit);

    return messages.map((msg, index) => ({
      record: {
        id: msg.id,
        conversationId: query,
        content: msg.content,
        recordType: 'message' as const,
        metadata: msg.metadata || {},
        createdAt: msg.timestamp,
      },
      score: 1 - index * 0.01, // Recency score: newest = 1.0
      source: 'chat_history' as const,
    }));
  }

  /**
   * Clear all records for a conversation
   */
  async clear(conversationId: string): Promise<void> {
    await pool.query('DELETE FROM memory_records WHERE conversation_id = $1', [conversationId]);
  }

  /**
   * Get record count for a conversation
   */
  async count(conversationId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM memory_records WHERE conversation_id = $1',
      [conversationId]
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Add a message to history
   */
  async addMessage(
    conversationId: string,
    message: Omit<MemoryMessage, 'id'>
  ): Promise<MemoryMessage> {
    const id = uuidv4();

    await pool.query(
      `INSERT INTO memory_records
       (id, conversation_id, content, record_type, metadata, created_at)
       VALUES ($1, $2, $3, 'message', $4, $5)`,
      [
        id,
        conversationId,
        message.content,
        JSON.stringify({ role: message.role, ...message.metadata }),
        message.timestamp,
      ]
    );

    // Check if we need to prune
    const count = await this.count(conversationId);
    if (count > this.config.maxMessages && this.config.summarizeOnOverflow) {
      await this.pruneOldMessages(conversationId);
    }

    return {
      id,
      ...message,
    };
  }

  /**
   * Get recent messages
   */
  async getRecentMessages(conversationId: string, limit?: number): Promise<MemoryMessage[]> {
    const maxLimit = limit || this.config.maxMessages;

    const result = await pool.query<{
      id: string;
      content: string;
      metadata: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, content, metadata, created_at
       FROM memory_records
       WHERE conversation_id = $1 AND record_type = 'message'
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, maxLimit]
    );

    // Return in chronological order (oldest first)
    return result.rows.reverse().map(row => ({
      id: row.id,
      role: (row.metadata?.role as MemoryMessage['role']) || 'user',
      content: row.content,
      timestamp: row.created_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Summarize conversation history
   */
  async summarize(conversationId: string): Promise<string> {
    const messages = await this.getRecentMessages(conversationId);

    if (messages.length === 0) {
      return '';
    }

    // Format messages for summarization
    const formatted = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    try {
      const llm = this.getLLM();
      const response = await llm.chat(
        [
          {
            role: 'user',
            content: `Summarize this conversation concisely, capturing the key points, decisions made, and any action items:\n\n${formatted}`,
          },
        ],
        'You are a helpful assistant that creates concise conversation summaries. Focus on: 1) Main topics discussed, 2) Decisions made, 3) Action items or next steps, 4) Any important context for future reference.'
      );

      return response.content;
    } catch (error) {
      console.error('[ChatHistoryBlock] Summarization failed:', error);
      // Fallback: return first and last few messages
      const first = messages.slice(0, 2);
      const last = messages.slice(-2);
      return `[Summary unavailable]\n\nFirst messages:\n${first.map(m => `- ${m.content.slice(0, 100)}...`).join('\n')}\n\nRecent messages:\n${last.map(m => `- ${m.content.slice(0, 100)}...`).join('\n')}`;
    }
  }

  /**
   * Prune old messages, optionally creating a summary
   */
  private async pruneOldMessages(conversationId: string): Promise<void> {
    const messages = await this.getRecentMessages(conversationId, this.config.maxMessages * 2);

    if (messages.length <= this.config.maxMessages) {
      return;
    }

    // Keep the most recent messages
    const toKeep = messages.slice(-this.config.maxMessages);
    const toPrune = messages.slice(0, -this.config.maxMessages);

    if (this.config.summarizeOnOverflow && toPrune.length > 0) {
      // Create a summary of pruned messages
      const formatted = toPrune.map(m => `${m.role}: ${m.content}`).join('\n');

      try {
        const llm = this.getLLM();
        const summary = await llm.chat(
          [{ role: 'user', content: `Summarize briefly: ${formatted}` }],
          'Create a very brief summary (2-3 sentences) of this conversation segment.'
        );

        // Store summary as a special record
        await this.write({
          conversationId,
          content: `[Previous conversation summary]: ${summary.content}`,
          recordType: 'summary',
          metadata: {
            prunedMessageCount: toPrune.length,
            prunedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.warn('[ChatHistoryBlock] Failed to create prune summary:', error);
      }
    }

    // Delete old messages
    const keepIds = toKeep.map(m => m.id);
    if (keepIds.length > 0) {
      await pool.query(
        `DELETE FROM memory_records
         WHERE conversation_id = $1
         AND record_type = 'message'
         AND id NOT IN (SELECT unnest($2::uuid[]))`,
        [conversationId, keepIds]
      );
    }

    console.log(
      `[ChatHistoryBlock] Pruned ${toPrune.length} messages from conversation ${conversationId}`
    );
  }

  /**
   * Get formatted context for prompts
   */
  async getFormattedContext(conversationId: string, maxMessages?: number): Promise<string> {
    const messages = await this.getRecentMessages(conversationId, maxMessages || 20);

    if (messages.length === 0) {
      return '';
    }

    // Check for any summaries
    const summaries = await pool.query<{ content: string }>(
      `SELECT content FROM memory_records
       WHERE conversation_id = $1 AND record_type = 'summary'
       ORDER BY created_at DESC LIMIT 1`,
      [conversationId]
    );

    let context = '';

    if (summaries.rows.length > 0) {
      context += summaries.rows[0].content + '\n\n---\n\n';
    }

    context += messages.map(m => `**${m.role}**: ${m.content}`).join('\n\n');

    return context;
  }
}

/**
 * Create a ChatHistoryBlock instance
 */
export function createChatHistoryBlock(config?: Partial<ChatHistoryConfig>): ChatHistoryBlock {
  return new ChatHistoryBlock(config);
}
