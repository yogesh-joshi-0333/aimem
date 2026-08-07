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
 * How many candidates to pull from each of the vector and keyword searches
 * before fusing and truncating to the caller's requested limit — wider than
 * the final limit so a strong keyword-only or vector-only match isn't
 * dropped just because it fell outside a too-narrow initial candidate pool.
 */
export const HYBRID_CANDIDATE_POOL_SIZE = 20;
