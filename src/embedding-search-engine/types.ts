export interface SimilaritySearchResult {
  readonly observation_id: string;
  readonly distance: number;
}

export const EMBEDDING_DIMENSIONS = 384;
