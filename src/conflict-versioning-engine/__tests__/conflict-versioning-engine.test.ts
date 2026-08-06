import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { ConflictVersioningEngine } from "../conflict-versioning-engine.js";
import { ConflictNotFoundError } from "../errors.js";

describe("ConflictVersioningEngine", () => {
  let dir: string;
  let storage: StorageEngine;
  let engine: ConflictVersioningEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-conflict-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    engine = new ConflictVersioningEngine(storage);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("detectConflict", () => {
    it("returns undefined when there is no existing observation for the entity+attribute", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const result = engine.detectConflict(entity.id, "engine", "PostgreSQL");
      expect(result).toBeUndefined();
    });

    it("returns undefined when attribute is not provided (nothing to compare against)", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      storage.createObservation({ entity_id: entity.id, observation: "some note", source_trigger: "event" });
      const result = engine.detectConflict(entity.id, undefined, "another note");
      expect(result).toBeUndefined();
    });

    it("returns undefined when the new value matches the existing value (normalized)", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      storage.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "PostgreSQL",
        source_trigger: "event",
      });
      const result = engine.detectConflict(entity.id, "engine", "  postgresql  ");
      expect(result).toBeUndefined();
    });

    it("detects a conflict and creates a pending conflict record when values differ", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      storage.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });

      const result = engine.detectConflict(entity.id, "engine", "PostgreSQL");
      expect(result?.conflict_detected).toBe(true);
      expect(result?.existing_value).toBe("MySQL");
      expect(result?.new_value).toBe("PostgreSQL");

      const stored = storage.getConflictById(result?.conflict_id ?? "");
      expect(stored?.status).toBe("pending");
    });
  });

  describe("confirmUpdate", () => {
    it("throws ConflictNotFoundError for an unknown conflict_id", () => {
      expect(() => engine.confirmUpdate("does-not-exist", "confirm")).toThrow(ConflictNotFoundError);
    });

    it("on reject: leaves the existing value untouched and marks the conflict rejected", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = storage.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      const conflict = engine.detectConflict(entity.id, "engine", "PostgreSQL");

      const result = engine.confirmUpdate(conflict?.conflict_id ?? "", "reject");
      expect(result).toEqual({ updated: false });

      const unchanged = storage.getObservationById(obs.id);
      expect(unchanged?.observation).toBe("MySQL");
      expect(unchanged?.version).toBe(1);

      const resolvedConflict = storage.getConflictById(conflict?.conflict_id ?? "");
      expect(resolvedConflict?.status).toBe("rejected");
    });

    it("on confirm: archives the old value, updates the live row, and increments version", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = storage.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      const conflict = engine.detectConflict(entity.id, "engine", "PostgreSQL");

      const result = engine.confirmUpdate(conflict?.conflict_id ?? "", "confirm");
      expect(result.updated).toBe(true);
      expect(result.new_version).toBe(2);

      const updated = storage.getObservationById(obs.id);
      expect(updated?.observation).toBe("PostgreSQL");
      expect(updated?.version).toBe(2);

      const history = storage.getVersionHistory(obs.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.value).toBe("MySQL");
      expect(history[0]?.superseded_by_version).toBe(2);

      const resolvedConflict = storage.getConflictById(conflict?.conflict_id ?? "");
      expect(resolvedConflict?.status).toBe("confirmed");
    });

    it("throws ConflictNotFoundError when confirming an already-resolved conflict", () => {
      const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      storage.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      const conflict = engine.detectConflict(entity.id, "engine", "PostgreSQL");
      engine.confirmUpdate(conflict?.conflict_id ?? "", "confirm");

      expect(() => engine.confirmUpdate(conflict?.conflict_id ?? "", "confirm")).toThrow(ConflictNotFoundError);
    });
  });
});
