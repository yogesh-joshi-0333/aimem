import type { StorageEngine } from "../storage-engine/storage-engine.js";
import type { EmbeddingEngine } from "./embedding-engine.js";
import { searchSimilar as searchSimilarVectors, upsertEmbedding } from "./vector-index.js";
import type { SimilaritySearchResult } from "./types.js";

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
