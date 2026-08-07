import type { StorageEngine } from "../storage-engine/storage-engine.js";
import type { EmbeddingEngine } from "../embedding-search-engine/embedding-engine.js";
import { searchHybridObservations } from "../embedding-search-engine/embedding-search-coordinator.js";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "../config.js";
import { TOP_ENTITIES_COUNT } from "./types.js";
import type { ProjectContextSummary, SearchQueryInput, SearchResults } from "./types.js";

export class RetrievalEngine {
  constructor(
    private readonly storage: StorageEngine,
    private readonly embedder: EmbeddingEngine,
  ) {}

  getProjectContext(): ProjectContextSummary {
    const entityCount = this.storage.countEntities();
    if (entityCount === 0) {
      return { has_memory: false };
    }

    const lastUpdatedAt = this.storage.getLastUpdatedAt();
    if (lastUpdatedAt === undefined) {
      return { has_memory: false };
    }

    return {
      has_memory: true,
      summary: {
        entity_count: entityCount,
        last_updated_at: lastUpdatedAt,
        top_entities: this.storage.getTopEntitiesByRecentActivity(TOP_ENTITIES_COUNT),
      },
    };
  }

  async search(input: SearchQueryInput): Promise<SearchResults> {
    const limit = Math.min(input.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
    const similar = await searchHybridObservations(this.storage, this.embedder, input.query, limit);

    const results = similar
      .map((match) => {
        const observation = this.storage.getObservationById(match.observation_id);
        if (observation === undefined || observation.invalidated_at !== null) {
          return undefined;
        }
        const entity = this.storage.getEntityById(observation.entity_id);
        if (entity === undefined) {
          return undefined;
        }
        if (input.entity_type !== undefined && entity.entity_type !== input.entity_type) {
          return undefined;
        }
        return {
          entity: entity.name,
          entity_type: entity.entity_type,
          observation: observation.observation,
          confidence: observation.confidence,
          created_at: observation.created_at,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== undefined);

    return { results };
  }
}
