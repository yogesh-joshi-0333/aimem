import type { StorageEngine } from "../storage-engine/storage-engine.js";
import type { EmbeddingEngine } from "./embedding-engine.js";
import { searchHybrid } from "./hybrid-search.js";
import { searchSimilar as searchSimilarVectors, upsertEmbedding } from "./vector-index.js";
import type { HybridSearchResult, SimilaritySearchResult } from "./types.js";

export async function embedAndStore(
  storage: StorageEngine,
  embedder: EmbeddingEngine,
  observationId: string,
  text: string,
): Promise<void> {
  const embedding = await embedder.embed(text);
  upsertEmbedding(storage.getRawConnection(), observationId, embedding);
}

export async function searchSimilarObservations(
  storage: StorageEngine,
  embedder: EmbeddingEngine,
  queryText: string,
  limit: number,
): Promise<readonly SimilaritySearchResult[]> {
  const queryEmbedding = await embedder.embed(queryText);
  return searchSimilarVectors(storage.getRawConnection(), queryEmbedding, limit);
}

/**
 * Vector similarity + FTS5 keyword search, combined via Reciprocal Rank
 * Fusion (see hybrid-search.ts). This is what memory_search actually calls
 * as of Phase 9E — pure-vector search (searchSimilarObservations above)
 * remains available and is still exercised directly by earlier tests, but
 * the retrieval engine's real query path now goes through this function so
 * an exact identifier/term match surfaces reliably even when it wouldn't
 * rank highly on embedding similarity alone.
 */
export async function searchHybridObservations(
  storage: StorageEngine,
  embedder: EmbeddingEngine,
  queryText: string,
  limit: number,
): Promise<readonly HybridSearchResult[]> {
  const queryEmbedding = await embedder.embed(queryText);
  return searchHybrid(storage.getRawConnection(), queryEmbedding, queryText, limit);
}
