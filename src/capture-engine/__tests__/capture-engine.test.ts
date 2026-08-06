import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../../embedding-search-engine/embedding-engine.js";
import { ConflictVersioningEngine } from "../../conflict-versioning-engine/conflict-versioning-engine.js";
import { CaptureEngine } from "../capture-engine.js";
import { InvalidInputError } from "../errors.js";

describe("CaptureEngine", () => {
  let dir: string;
  let storage: StorageEngine;
  let embedder: EmbeddingEngine;
  let capture: CaptureEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-capture-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    embedder = new EmbeddingEngine();
    capture = new CaptureEngine(storage, embedder, new ConflictVersioningEngine(storage));
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("store (memory_store, event-based)", () => {
    it("creates a new entity and observation, with conflict_detected: false", async () => {
      const result = await capture.store(
        { entity: "staging-db", entity_type: "credential", observation: "password rotated" },
        "event",
      );
      expect(result.conflict_detected).toBe(false);
      if (!result.conflict_detected) {
        expect(result.id).toBeDefined();
        expect(result.created_at).toBeDefined();
      }
    });

    it("reuses an existing entity across multiple store calls for the same name+type", async () => {
      await capture.store({ entity: "primary-db", entity_type: "architecture_fact", observation: "engine is MySQL" }, "event");
      await capture.store(
        { entity: "primary-db", entity_type: "architecture_fact", observation: "hosted on AWS RDS" },
        "event",
      );
      const entity = storage.getEntityByName("primary-db", "architecture_fact");
      expect(entity).toBeDefined();
      expect(storage.getObservationsByEntity(entity?.id ?? "")).toHaveLength(2);
    });

    it("persists the given source_trigger value exactly", async () => {
      const result = await capture.store(
        { entity: "auth-service", entity_type: "decision", observation: "use JWT" },
        "context_threshold_scan",
      );
      if (!result.conflict_detected) {
        const observation = storage.getObservationById(result.id);
        expect(observation?.source_trigger).toBe("context_threshold_scan");
      }
    });

    it("returns conflict_detected: true instead of writing when a contradicting value is stored for the same entity+attribute", async () => {
      await capture.store(
        { entity: "primary-db", entity_type: "architecture_fact", attribute: "engine", observation: "MySQL" },
        "event",
      );
      const result = await capture.store(
        { entity: "primary-db", entity_type: "architecture_fact", attribute: "engine", observation: "PostgreSQL" },
        "event",
      );

      expect(result.conflict_detected).toBe(true);
      if (result.conflict_detected) {
        expect(result.existing_value).toBe("MySQL");
        expect(result.new_value).toBe("PostgreSQL");
      }

      const entity = storage.getEntityByName("primary-db", "architecture_fact");
      const observations = storage.getObservationsByEntity(entity?.id ?? "");
      expect(observations).toHaveLength(1);
      expect(observations[0]?.observation).toBe("MySQL");
    });
  });

  describe("scan (memory_scan, turn/context-threshold batch)", () => {
    it("stores all non-duplicate candidates in a batch", async () => {
      const result = await capture.scan(
        [
          { entity: "auth-service", entity_type: "decision", observation: "use JWT with 15-minute expiry" },
          { entity: "redis", entity_type: "decision", observation: "use Redis for session cache" },
        ],
        "turn_scan",
      );
      expect(result.stored).toHaveLength(2);
      expect(result.skipped_duplicates).toHaveLength(0);
    });

    it("skips near-duplicate candidates against existing observations", async () => {
      await capture.store(
        { entity: "auth-service", entity_type: "decision", observation: "use JWT with 15-minute expiry" },
        "event",
      );
      const result = await capture.scan(
        [{ entity: "auth-service", entity_type: "decision", observation: "use JWT with 15-minute expiry" }],
        "turn_scan",
      );
      expect(result.stored).toHaveLength(0);
      expect(result.skipped_duplicates).toHaveLength(1);
    });

    it("rejects an empty candidates array with InvalidInputError", async () => {
      await expect(capture.scan([], "turn_scan")).rejects.toThrow(InvalidInputError);
    });

    it("stores a mix of new and duplicate candidates correctly (partial duplicates)", async () => {
      await capture.store({ entity: "redis", entity_type: "decision", observation: "use Redis for session cache" }, "event");
      const result = await capture.scan(
        [
          { entity: "redis", entity_type: "decision", observation: "use Redis for session cache" },
          { entity: "auth-service", entity_type: "decision", observation: "use JWT for auth tokens" },
        ],
        "context_threshold_scan",
      );
      expect(result.stored).toHaveLength(1);
      expect(result.skipped_duplicates).toHaveLength(1);
    });

    it("reports a candidate as a conflict rather than storing or skipping it as a duplicate", async () => {
      await capture.store(
        { entity: "primary-db", entity_type: "architecture_fact", attribute: "engine", observation: "MySQL" },
        "event",
      );
      const result = await capture.scan(
        [
          {
            entity: "primary-db",
            entity_type: "architecture_fact",
            attribute: "engine",
            observation: "PostgreSQL",
          },
        ],
        "context_threshold_scan",
      );
      expect(result.stored).toHaveLength(0);
      expect(result.skipped_duplicates).toHaveLength(0);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]?.entity).toBe("primary-db");
      expect(result.conflicts[0]?.existing_value).toBe("MySQL");
      expect(result.conflicts[0]?.new_value).toBe("PostgreSQL");
    });
  });

  describe("remember (manual override)", () => {
    it("stores unconditionally with source_trigger: manual", async () => {
      const result = await capture.remember({
        entity: "deploy-process",
        entity_type: "decision",
        observation: "never deploy on Fridays",
      });
      expect(result.conflict_detected).toBe(false);
      if (!result.conflict_detected) {
        const observation = storage.getObservationById(result.id);
        expect(observation?.source_trigger).toBe("manual");
      }
    });
  });
});
