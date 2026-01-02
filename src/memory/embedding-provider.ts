/**
 * Embedding Provider
 * ==================
 *
 * Provides text embeddings using OpenAI's text-embedding API.
 * Used by VectorDBBlock for semantic search.
 */

import type { IEmbeddingProvider } from './types';

/**
 * OpenAI Embedding Provider
 * Uses text-embedding-3-small by default (1536 dimensions)
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private dimensions: number;

  constructor(config?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = config?.model || 'text-embedding-3-small';
    this.baseUrl = config?.baseUrl || 'https://api.openai.com/v1';

    // Dimensions by model
    const modelDimensions: Record<string, number> = {
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };
    this.dimensions = modelDimensions[this.model] || 1536;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('[EmbeddingProvider] OPENAI_API_KEY is required for embeddings');
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`[EmbeddingProvider] OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map(d => d.embedding);
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Check if the provider is available
   */
  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }
}

/**
 * Create default embedding provider
 */
export function createEmbeddingProvider(config?: {
  apiKey?: string;
  model?: string;
}): IEmbeddingProvider {
  return new OpenAIEmbeddingProvider(config);
}
