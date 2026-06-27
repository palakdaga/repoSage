import { CodeChunk } from '@/lib/types';
import { OllamaService } from './OllamaService';
import { Logger } from '@/lib/utils/errors';

interface StoredVector {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

// Global singleton store so chat route shares the same data
let globalStore: Map<string, StoredVector[]> | null = null;

function getGlobalStore(): Map<string, StoredVector[]> {
  if (!globalStore) {
    globalStore = new Map();
  }
  return globalStore;
}

export class VectorDBService {
  private store: Map<string, StoredVector[]>;
  private ollama: OllamaService;
  private embeddingCache: Map<string, number[]> = new Map();

  // Concurrency control for parallel embedding
  private static readonly BATCH_SIZE = 15;
  private static readonly MIN_SIMILARITY_SCORE = 0.15;

  constructor(ollama?: OllamaService) {
    this.ollama = ollama || new OllamaService();
    this.store = getGlobalStore();
  }

  async storeChunks(repositoryId: string, chunks: CodeChunk[]): Promise<number> {
    Logger.info(`[VectorDB] Storing ${chunks.length} chunks for ${repositoryId}`);

    // Deduplicate chunks by content hash
    const uniqueChunks = this.deduplicateChunks(chunks);
    Logger.info(`[VectorDB] ${chunks.length} chunks deduplicated to ${uniqueChunks.length}`);

    // Embed in parallel batches with concurrency control
    const vectors: StoredVector[] = [];
    const totalBatches = Math.ceil(uniqueChunks.length / VectorDBService.BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const start = batchIdx * VectorDBService.BATCH_SIZE;
      const end = Math.min(start + VectorDBService.BATCH_SIZE, uniqueChunks.length);
      const batch = uniqueChunks.slice(start, end);

      if (batchIdx % 10 === 0 || batchIdx === totalBatches - 1) {
        Logger.info(`[VectorDB] Embedding batch ${batchIdx + 1}/${totalBatches}`);
      }

      // Process each batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(async (chunk) => {
          const embedding = await this.getOrCreateEmbedding(chunk.content);
          return {
            id: chunk.id,
            content: chunk.content,
            embedding,
            metadata: {
              ...chunk.metadata,
              fileId: chunk.fileId,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            },
          } as StoredVector;
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          vectors.push(result.value);
        } else {
          Logger.warn(`[VectorDB] Failed to embed a chunk: ${result.reason}`);
        }
      }
    }

    // Merge with existing vectors for this repo (don't overwrite)
    const existing = this.store.get(repositoryId) || [];
    const existingIds = new Set(existing.map((v) => v.id));
    const newVectors = vectors.filter((v) => !existingIds.has(v.id));
    const merged = [...existing, ...newVectors];

    this.store.set(repositoryId, merged);
    Logger.info(`[VectorDB] Stored ${merged.length} total vectors for ${repositoryId} (${newVectors.length} new)`);
    return merged.length;
  }

  async similaritySearch(
    repositoryId: string,
    query: string,
    topK = 12
  ): Promise<Array<{ content: string; score: number; metadata: Record<string, unknown> }>> {
    const vectors = this.store.get(repositoryId);
    if (!vectors || vectors.length === 0) {
      return [];
    }

    const queryEmbedding = await this.getOrCreateEmbedding(query);

    const scored = vectors.map((v) => ({
      content: v.content,
      score: this.cosineSimilarity(queryEmbedding, v.embedding),
      metadata: v.metadata,
    }));

    // Filter by minimum score threshold, then sort and take topK
    const filtered = scored.filter((s) => s.score >= VectorDBService.MIN_SIMILARITY_SCORE);
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, topK);
  }

  hasRepository(repositoryId: string): boolean {
    return this.store.has(repositoryId) && (this.store.get(repositoryId)?.length ?? 0) > 0;
  }

  clearRepository(repositoryId: string): void {
    this.store.delete(repositoryId);
  }

  clearEmbeddingCache(): void {
    this.embeddingCache.clear();
  }

  private async getOrCreateEmbedding(text: string): Promise<number[]> {
    const cacheKey = this.hashContent(text);
    const cached = this.embeddingCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const embedding = await this.ollama.generateEmbedding(text);
    this.embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  private deduplicateChunks(chunks: CodeChunk[]): CodeChunk[] {
    const seen = new Set<string>();
    const unique: CodeChunk[] = [];

    for (const chunk of chunks) {
      const hash = this.hashContent(chunk.content);
      if (!seen.has(hash)) {
        seen.add(hash);
        unique.push(chunk);
      }
    }

    return unique;
  }

  private hashContent(text: string): string {
    // Fast FNV-1a-inspired hash for deduplication
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(36);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }
}
