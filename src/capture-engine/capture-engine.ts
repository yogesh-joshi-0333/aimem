import type { StorageEngine } from "../storage-engine/storage-engine.js";
import type { EmbeddingEngine } from "../embedding-search-engine/embedding-engine.js";
import { embedAndStore } from "../embedding-search-engine/embedding-search-coordinator.js";
import type { ConflictVersioningEngine } from "../conflict-versioning-engine/conflict-versioning-engine.js";
import type { CreateObservationInput, SourceTrigger } from "../storage-engine/types.js";
import { isDuplicate } from "./dedup.js";
import { InvalidInputError } from "./errors.js";
import type { CaptureCandidate, ScanConflictSummary, ScanResult, StoreOutcome } from "./types.js";

function toObservationInput(
  candidate: CaptureCandidate,
  entityId: string,
  sourceTrigger: SourceTrigger,
): CreateObservationInput {
  return {
    entity_id: entityId,
    observation: candidate.observation,
    source_trigger: sourceTrigger,
    ...(candidate.attribute !== undefined ? { attribute: candidate.attribute } : {}),
  };
}

export class CaptureEngine {
  constructor(
    private readonly storage: StorageEngine,
    private readonly embedder: EmbeddingEngine,
    private readonly conflicts: ConflictVersioningEngine,
  ) {}

  async store(candidate: CaptureCandidate, sourceTrigger: SourceTrigger): Promise<StoreOutcome> {
    const entity = this.storage.createEntity({ name: candidate.entity, entity_type: candidate.entity_type });

    const conflict = this.conflicts.detectConflict(entity.id, candidate.attribute, candidate.observation);
    if (conflict !== undefined) {
      return conflict;
    }

    const observation = this.storage.createObservation(toObservationInput(candidate, entity.id, sourceTrigger));
    await embedAndStore(this.storage, this.embedder, observation.id, observation.observation);

    return {
      id: observation.id,
      created_at: observation.created_at,
      conflict_detected: false,
    };
  }

  async scan(candidates: readonly CaptureCandidate[], sourceTrigger: SourceTrigger): Promise<ScanResult> {
    if (candidates.length === 0) {
      throw new InvalidInputError("memory_scan requires at least one candidate");
    }

    const stored: string[] = [];
    const skippedDuplicates: string[] = [];
    const conflictSummaries: ScanConflictSummary[] = [];

    for (const candidate of candidates) {
      const entity = this.storage.createEntity({ name: candidate.entity, entity_type: candidate.entity_type });

      const conflict = this.conflicts.detectConflict(entity.id, candidate.attribute, candidate.observation);
      if (conflict !== undefined) {
        conflictSummaries.push({
          conflict_id: conflict.conflict_id,
          entity: candidate.entity,
          existing_value: conflict.existing_value,
          new_value: conflict.new_value,
        });
        continue;
      }

      const existing = this.storage.getObservationsByEntity(entity.id);
      if (isDuplicate(candidate.observation, existing)) {
        skippedDuplicates.push(candidate.observation);
        continue;
      }

      const observation = this.storage.createObservation(toObservationInput(candidate, entity.id, sourceTrigger));
      await embedAndStore(this.storage, this.embedder, observation.id, observation.observation);
      stored.push(observation.id);
    }

    return { stored, skipped_duplicates: skippedDuplicates, conflicts: conflictSummaries };
  }

  async remember(candidate: CaptureCandidate): Promise<StoreOutcome> {
    return this.store(candidate, "manual");
  }
}
