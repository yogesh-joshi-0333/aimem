export interface ProjectContextSummary {
  readonly has_memory: boolean;
  readonly summary?: {
    readonly entity_count: number;
    readonly last_updated_at: string;
    readonly top_entities: readonly string[];
  };
}

export interface SearchQueryInput {
  readonly query: string;
  readonly entity_type?: string;
  readonly limit?: number;
}

export interface SearchResultItem {
  readonly entity: string;
  readonly entity_type: string;
  readonly observation: string;
  readonly confidence: number;
  readonly created_at: string;
}

export interface SearchResults {
  readonly results: readonly SearchResultItem[];
}

export const TOP_ENTITIES_COUNT = 5;
