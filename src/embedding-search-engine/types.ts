export interface SimilaritySearchResult {
  readonly observation_id: string;
  readonly distance: number;
}

export interface KeywordSearchResult {
  readonly observation_id: string;
  readonly rank: number;
}

export interface HybridSearchResult {
  readonly observation_id: string;
  readonly score: number;
}

export const EMBEDDING_DIMENSIONS = 384;

/**
 * Floor on how many candidates to pull from each of the vector and keyword
 * searches before fusing and truncating to the caller's requested limit --
 * the actual per-mode pool size is max(limit, this floor), so it's wider
 * than the final limit for small requests (helping a strong keyword-only or
 * vector-only match survive fusion) while never being smaller than what the
 * caller asked for (see hybrid-search.ts's searchHybrid).
 */
export const MIN_HYBRID_CANDIDATE_POOL_SIZE = 20;
