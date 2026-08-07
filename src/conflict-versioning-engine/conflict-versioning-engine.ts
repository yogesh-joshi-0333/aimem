import type { StorageEngine } from "../storage-engine/storage-engine.js";
import { ConflictNotFoundError } from "./errors.js";
import type { ConfirmAction, ConfirmUpdateResult, ConflictCheckResult } from "./types.js";

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export class ConflictVersioningEngine {
  constructor(private readonly storage: StorageEngine) {}

  detectConflict(entityId: string, attribute: string | undefined, newValue: string): ConflictCheckResult | undefined {
    if (attribute === undefined) {
      return undefined;
    }

    const existing = this.storage.findLatestObservation(entityId, attribute);
    if (existing === undefined) {
      return undefined;
    }

    if (normalize(existing.observation) === normalize(newValue)) {
      return undefined;
    }

    const conflict = this.storage.createConflict(existing.id, existing.observation, newValue);
    return {
      conflict_detected: true,
      conflict_id: conflict.id,
      existing_value: conflict.existing_value,
      new_value: conflict.new_value,
    };
  }

  confirmUpdate(conflictId: string, action: ConfirmAction): ConfirmUpdateResult {
    const conflict = this.storage.getConflictById(conflictId);
    if (conflict === undefined || conflict.status !== "pending") {
      throw new ConflictNotFoundError(conflictId);
    }

    if (action === "reject") {
      this.storage.resolveConflict(conflictId, "rejected");
      return { updated: false };
    }

    this.storage.backupNow();

    return this.storage.runInTransaction(() => {
      const observation = this.storage.getObservationById(conflict.observation_id);
      if (observation === undefined) {
        throw new ConflictNotFoundError(conflictId);
      }

      const newVersion = observation.version + 1;
      this.storage.archiveVersion(observation.id, observation.observation, observation.version, newVersion);
      this.storage.updateObservationValue(observation.id, conflict.new_value, newVersion);
      this.storage.resolveConflict(conflictId, "confirmed");

      return { updated: true, new_version: newVersion };
    });
  }
}
