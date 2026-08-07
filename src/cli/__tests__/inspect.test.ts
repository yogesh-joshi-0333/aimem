import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../../embedding-search-engine/embedding-engine.js";
import { embedAndStore } from "../../embedding-search-engine/embedding-search-coordinator.js";
import { runExport, runList, runRepair, runSearch } from "../inspect.js";

describe("aimem-inspect (Phase 9D)", () => {
  let dir: string;
  let dbPath: string;
  let storage: StorageEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-inspect-test-"));
    dbPath = join(dir, "memory.db");
    storage = new StorageEngine(dbPath);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("runList", () => {
    it("returns an empty entity list for a fresh store", () => {
      expect(runList(storage)).toEqual({ entities: [] });
    });

    it("lists entities with their live observations", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      storage.createObservation({ entity_id: entity.id, observation: "password rotated", source_trigger: "event" });

      const result = runList(storage);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.name).toBe("staging-db");
      expect(result.entities[0]?.observations).toHaveLength(1);
      expect(result.entities[0]?.observations[0]?.observation).toBe("password rotated");
    });

    it("excludes invalidated observations from the listing", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const obs = storage.createObservation({
        entity_id: entity.id,
        observation: "old password",
        source_trigger: "event",
      });
      storage.invalidateObservation(obs.id);

      const result = runList(storage);
      expect(result.entities[0]?.observations).toHaveLength(0);
    });
  });

  describe("runSearch", () => {
    it("finds a relevant observation via the same hybrid search memory_search uses", async () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const obs = storage.createObservation({
        entity_id: entity.id,
        observation: "staging DB password rotated to use env var STAGING_DB_PASS",
        source_trigger: "event",
      });
      const embedder = new EmbeddingEngine();
      await embedAndStore(storage, embedder, obs.id, obs.observation);

      const result = await runSearch(storage, embedder, "staging database credentials", 10);
      expect(result.results.some((r) => r.entity === "staging-db")).toBe(true);
    });
  });

  describe("runExport", () => {
    it("exports the full entity/observation graph with an exported_at timestamp", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      storage.createObservation({ entity_id: entity.id, observation: "password rotated", source_trigger: "event" });

      const result = runExport(storage);
      expect(result.exported_at).toBeTruthy();
      expect(result.entities).toHaveLength(1);
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0]?.observation).toBe("password rotated");
    });

    it("includes invalidated observations in the export (unlike runList)", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const obs = storage.createObservation({
        entity_id: entity.id,
        observation: "old password",
        source_trigger: "event",
      });
      storage.invalidateObservation(obs.id);

      const result = runExport(storage);
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0]?.invalidated_at).toBeTruthy();
    });
  });

  describe("runRepair", () => {
    it("reports no backup exists when none has been made", () => {
      const result = runRepair(dbPath, true);
      expect(result.repaired).toBe(false);
      expect(result.reason).toContain("no backup file exists");
    });

    it("does not restore without confirmation, even if a valid backup exists", () => {
      storage.backupNow();
      const result = runRepair(dbPath, false);
      expect(result.repaired).toBe(false);
      expect(result.reason).toContain("not confirmed");
    });

    it("restores from backup once confirmed", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      storage.createObservation({ entity_id: entity.id, observation: "password rotated", source_trigger: "event" });
      storage.backupNow();

      const result = runRepair(dbPath, true);
      expect(result.repaired).toBe(true);
    });
  });
});
