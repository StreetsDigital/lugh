/**
 * Vector DB Block
 * ================
 *
 * Semantic similarity-based memory retrieval.
 * Uses embeddings to find relevant context from past interactions.
 *
 * Based on CAMEL AI's VectorDBMemory pattern.
 *
 * Storage options:
 * 1. PostgreSQL with pgvector extension (recommended for production)
 * 2. In-memory fallback (for development/testing)
 */

import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/connection';
import type {
  IVectorDBBlock,
  VectorDBConfig,
  MemoryRecord,
  MemorySearchResult,
  IEmbeddingProvider,
} from './types';
import { createEmbeddingProvider } from './embedding-provider';

const DEFAULT_CONFIG: VectorDBConfig = {
  embeddingModel: 'text-embedding-3-small',
  similarityThreshold: 0.7,
  topK: 5,
};

/**
 * Check if pgvector extension is available
 */
async function isPgVectorAvailable(): Promise<boolean> {
  try {
    const result = await pool.query(
      'SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = \'vector\') as available'
    );
    return result.rows[0]?.available === true;
  } catch {
    return false;
  }
}

/**
 * VectorDBBlock implementation using PostgreSQL with pgvector
 */
export class VectorDBBlock implements IVectorDBBlock {
  config: VectorDBConfig;
  private embedder: IEmbeddingProvider;
  private pgVectorAvailable: boolean | null = null;
  private inMemoryStore = new Map<string, { record: MemoryRecord; embedding: number[] }[]>();

  constructor(config?: Partial<VectorDBConfig>, embedder?: IEmbeddingProvider) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embedder = embedder || createEmbeddingProvider({
      model: this.config.embeddingModel,
    });
  }

  /**
   * Check and cache pgvector availability
   */
  private async checkPgVector(): Promise<boolean> {
    if (this.pgVectorAvailable === null) {
      this.pgVectorAvailable = await isPgVectorAvailable();
      if (!this.pgVectorAvailable) {
        console.warn(
          '[VectorDBBlock] pgvector extension not available, using in-memory fallback. ' +
          'For production, run: CREATE EXTENSION vector;'
        );
      }
    }
    return this.pgVectorAvailable;
  }

  /**
   * Write a record (without embedding - use addWithEmbedding for semantic storage)
   */
  async write(
    record: Omit<MemoryRecord, 'id' | 'createdAt'>
  ): Promise<MemoryRecord> {
    return this.addWithEmbedding(record);
  }

  /**
   * Retrieve records by semantic similarity
   */
  async retrieve(query: string, limit?: number): Promise<MemorySearchResult[]> {
    // Parse query as "conversationId:searchQuery" format
    const [conversationId, ...searchParts] = query.split(':');
    const searchQuery = searchParts.join(':') || conversationId;

    return this.search(conversationId, searchQuery, limit);
  }

  /**
   * Clear all records for a conversation
   */
  async clear(conversationId: string): Promise<void> {
    const usePgVector = await this.checkPgVector();

    if (usePgVector) {
      await pool.query(
        'DELETE FROM memory_records WHERE conversation_id = $1 AND embedding IS NOT NULL',
        [conversationId]
      );
    } else {
      this.inMemoryStore.delete(conversationId);
    }
  }

  /**
   * Get record count for a conversation
   */
  async count(conversationId: string): Promise<number> {
    const usePgVector = await this.checkPgVector();

    if (usePgVector) {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM memory_records
         WHERE conversation_id = $1 AND embedding IS NOT NULL`,
        [conversationId]
      );
      return parseInt(result.rows[0]?.count || '0', 10);
    } else {
      const records = this.inMemoryStore.get(conversationId) || [];
      return records.length;
    }
  }

  /**
   * Search by semantic similarity
   */
  async search(
    conversationId: string,
    query: string,
    topK?: number
  ): Promise<MemorySearchResult[]> {
    const k = topK || this.config.topK;

    // Get query embedding
    const queryEmbedding = await this.embedder.embed(query);

    const usePgVector = await this.checkPgVector();

    if (usePgVector) {
      return this.searchWithPgVector(conversationId, queryEmbedding, k);
    } else {
      return this.searchInMemory(conversationId, queryEmbedding, k);
    }
  }

  /**
   * Search using pgvector
   */
  private async searchWithPgVector(
    conversationId: string,
    queryEmbedding: number[],
    topK: number
  ): Promise<MemorySearchResult[]> {
    // Use cosine distance for similarity search
    const result = await pool.query<{
      id: string;
      content: string;
      record_type: string;
      metadata: Record<string, unknown>;
      created_at: Date;
      similarity: number;
    }>(
      `SELECT
        id, content, record_type, metadata, created_at,
        1 - (embedding <=> $1::vector) as similarity
       FROM memory_records
       WHERE conversation_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [`[${queryEmbedding.join(',')}]`, conversationId, topK]
    );

    return result.rows
      .filter((row) => row.similarity >= this.config.similarityThreshold)
      .map((row) => ({
        record: {
          id: row.id,
          conversationId,
          content: row.content,
          recordType: row.record_type as MemoryRecord['recordType'],
          metadata: row.metadata,
          createdAt: row.created_at,
        },
        score: row.similarity,
        source: 'vector_db' as const,
      }));
  }

  /**
   * Search using in-memory cosine similarity
   */
  private searchInMemory(
    conversationId: string,
    queryEmbedding: number[],
    topK: number
  ): MemorySearchResult[] {
    const records = this.inMemoryStore.get(conversationId) || [];

    // Calculate cosine similarity for each record
    const scored = records.map(({ record, embedding }) => ({
      record,
      score: this.cosineSimilarity(queryEmbedding, embedding),
    }));

    // Sort by similarity and filter by threshold
    return scored
      .filter((s) => s.score >= this.config.similarityThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => ({
        record: s.record,
        score: s.score,
        source: 'vector_db' as const,
      }));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Add a record with automatic embedding generation
   */
  async addWithEmbedding(
    record: Omit<MemoryRecord, 'id' | 'createdAt' | 'embedding'>
  ): Promise<MemoryRecord> {
    const id = uuidv4();
    const createdAt = new Date();

    // Generate embedding
    const embedding = await this.embedder.embed(record.content);

    const usePgVector = await this.checkPgVector();

    if (usePgVector) {
      await pool.query(
        `INSERT INTO memory_records
         (id, conversation_id, content, embedding, record_type, metadata, created_at)
         VALUES ($1, $2, $3, $4::vector, $5, $6, $7)`,
        [
          id,
          record.conversationId,
          record.content,
          `[${embedding.join(',')}]`,
          record.recordType,
          JSON.stringify(record.metadata),
          createdAt,
        ]
      );
    } else {
      // Store in memory
      const records = this.inMemoryStore.get(record.conversationId) || [];
      records.push({
        record: { id, ...record, embedding, createdAt },
        embedding,
      });
      this.inMemoryStore.set(record.conversationId, records);
    }

    return {
      id,
      ...record,
      embedding,
      createdAt,
    };
  }

  /**
   * Store a code snippet with metadata
   */
  async storeCode(
    conversationId: string,
    code: string,
    filePath: string,
    language?: string
  ): Promise<MemoryRecord> {
    return this.addWithEmbedding({
      conversationId,
      content: code,
      recordType: 'code',
      metadata: {
        filePath,
        language: language || this.detectLanguage(filePath),
      },
    });
  }

  /**
   * Store a decision or important context
   */
  async storeDecision(
    conversationId: string,
    decision: string,
    context?: string
  ): Promise<MemoryRecord> {
    return this.addWithEmbedding({
      conversationId,
      content: decision,
      recordType: 'decision',
      metadata: { context },
    });
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      rb: 'ruby',
      php: 'php',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      swift: 'swift',
      sql: 'sql',
      md: 'markdown',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return languageMap[ext] || 'text';
  }
}

/**
 * Create a VectorDBBlock instance
 */
export function createVectorDBBlock(
  config?: Partial<VectorDBConfig>,
  embedder?: IEmbeddingProvider
): VectorDBBlock {
  return new VectorDBBlock(config, embedder);
}
