import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../../embedding-search-engine/embedding-engine.js";
import { embedAndStore } from "../../embedding-search-engine/embedding-search-coordinator.js";
import { ConflictVersioningEngine } from "../../conflict-versioning-engine/conflict-versioning-engine.js";
import { RetrievalEngine } from "../retrieval-engine.js";

describe("RetrievalEngine", () => {
  let dir: string;
  let storage: StorageEngine;
  let embedder: EmbeddingEngine;
  let retrieval: RetrievalEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-retrieval-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    embedder = new EmbeddingEngine();
    retrieval = new RetrievalEngine(storage, embedder);
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("getProjectContext (memory_get_project_context)", () => {
    it("returns has_memory: false on a fresh project with no observations", () => {
      const context = retrieval.getProjectContext();
      expect(context.has_memory).toBe(false);
      expect(context.summary).toBeUndefined();
    });

    it("returns has_memory: true with a summary once observations exist", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      storage.createObservation({ entity_id: entity.id, observation: "password rotated", source_trigger: "event" });

      const context = retrieval.getProjectContext();
      expect(context.has_memory).toBe(true);
      expect(context.summary?.entity_count).toBe(1);
      expect(context.summary?.last_updated_at).toBeDefined();
      expect(context.summary?.top_entities).toContain("staging-db");
    });

    it("ranks top_entities by most recent observation activity", () => {
      const older = storage.createEntity({ name: "old-entity", entity_type: "decision" });
      storage.createObservation({ entity_id: older.id, observation: "older fact", source_trigger: "event" });

      const newer = storage.createEntity({ name: "new-entity", entity_type: "decision" });
      storage.createObservation({ entity_id: newer.id, observation: "newer fact", source_trigger: "event" });

      const context = retrieval.getProjectContext();
      expect(context.summary?.top_entities[0]).toBe("new-entity");
    });
  });

  describe("search (memory_search)", () => {
    it("returns results relevant to the query, not the entire store", async () => {
      const staging = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const stagingObs = storage.createObservation({
        entity_id: staging.id,
        observation: "staging DB password rotated to use env var STAGING_DB_PASS",
        source_trigger: "event",
      });
      await embedAndStore(storage, embedder, stagingObs.id, stagingObs.observation);

      const unrelated = storage.createEntity({ name: "lunch-preferences", entity_type: "decision" });
      const unrelatedObs = storage.createObservation({
        entity_id: unrelated.id,
        observation: "the team prefers pineapple on pizza for friday lunches",
        source_trigger: "manual",
      });
      await embedAndStore(storage, embedder, unrelatedObs.id, unrelatedObs.observation);

      const results = await retrieval.search({ query: "staging database credentials", limit: 1 });
      expect(results.results).toHaveLength(1);
      expect(results.results[0]?.entity).toBe("staging-db");
    });

    it("filters results by entity_type when provided", async () => {
      const credential = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const credentialObs = storage.createObservation({
        entity_id: credential.id,
        observation: "staging database password",
        source_trigger: "event",
      });
      await embedAndStore(storage, embedder, credentialObs.id, credentialObs.observation);

      const decision = storage.createEntity({ name: "staging-deploy", entity_type: "decision" });
      const decisionObs = storage.createObservation({
        entity_id: decision.id,
        observation: "staging database deploy approach",
        source_trigger: "event",
      });
      await embedAndStore(storage, embedder, decisionObs.id, decisionObs.observation);

      const results = await retrieval.search({ query: "staging database", entity_type: "credential", limit: 10 });
      expect(results.results.every((r) => r.entity_type === "credential")).toBe(true);
    });

    it("caps the limit at MAX_SEARCH_LIMIT (50) even if a larger limit is requested", async () => {
      const entity = storage.createEntity({ name: "bulk-entity", entity_type: "decision" });
      for (let i = 0; i < 60; i += 1) {
        const obs = storage.createObservation({
          entity_id: entity.id,
          observation: `fact number ${i} about the bulk entity`,
          source_trigger: "event",
        });
        await embedAndStore(storage, embedder, obs.id, obs.observation);
      }
      const results = await retrieval.search({ query: "fact about the bulk entity", limit: 999 });
      // Hybrid search's per-mode candidate pool scales to at least the requested/capped
      // limit (see hybrid-search.ts's searchHybrid, fixed during the post-launch hardening
      // pass — it used to be a fixed pool smaller than MAX_SEARCH_LIMIT, which could
      // silently cap results below 50 even with enough distinct candidates available).
      // With 60 distinct live observations, exactly 50 should come back.
      expect(results.results.length).toBe(50);
    });

    it("excludes an invalidated observation from results (Phase 9F)", async () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const obs = storage.createObservation({
        entity_id: entity.id,
        observation: "staging DB password rotated to use env var STAGING_DB_PASS",
        source_trigger: "event",
      });
      await embedAndStore(storage, embedder, obs.id, obs.observation);

      new ConflictVersioningEngine(storage).invalidate(obs.id);

      const results = await retrieval.search({ query: "staging database credentials", limit: 10 });
      expect(results.results).toHaveLength(0);
    });

    it("does not let invalidated observations starve the candidate pool for live results (post-launch hardening)", async () => {
      // Regression test: invalidated rows used to be filtered out only after the vector/FTS5
      // candidate pool was already truncated to a fixed size, so invalidating most candidates
      // could zero out the final result even when enough live matches existed. Fixed by
      // excluding invalidated rows directly in the SQL search paths (vector-index.ts,
      // keyword-search.ts) instead of post-filtering after truncation.
      const entity = storage.createEntity({ name: "bulk", entity_type: "decision" });
      const obsIds: string[] = [];
      for (let i = 0; i < 10; i += 1) {
        const obs = storage.createObservation({
          entity_id: entity.id,
          observation: `fact number ${i} about testing`,
          source_trigger: "event",
        });
        await embedAndStore(storage, embedder, obs.id, obs.observation);
        obsIds.push(obs.id);
      }

      const conflicts = new ConflictVersioningEngine(storage);
      for (const id of obsIds.slice(0, 8)) {
        conflicts.invalidate(id);
      }

      const results = await retrieval.search({ query: "fact about testing", limit: 5 });
      expect(results.results.length).toBe(2);
    });
  });

  describe("getProjectContext excludes invalidated observations (Phase 9F)", () => {
    it("reports has_memory: false when the only observation has been invalidated", () => {
      const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
      const obs = storage.createObservation({ entity_id: entity.id, observation: "password rotated", source_trigger: "event" });
      new ConflictVersioningEngine(storage).invalidate(obs.id);

      const context = retrieval.getProjectContext();
      expect(context.has_memory).toBe(false);
    });
  });
});
