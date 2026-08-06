import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../embedding-engine.js";
import { embedAndStore, searchSimilarObservations } from "../embedding-search-coordinator.js";

describe("Performance at scale (FR-STORE-07)", () => {
  let dir: string;
  let storage: StorageEngine;
  let embedder: EmbeddingEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-perf-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    embedder = new EmbeddingEngine();
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    "returns vector search results in under 200ms with 5,000 observations stored",
    { timeout: 300000 },
    async () => {
      const entity = storage.createEntity({ name: "load-test-entity", entity_type: "decision" });
      const target = storage.createObservation({
        entity_id: entity.id,
        observation: "the staging deploy pipeline uses GitHub Actions with a manual approval gate",
        source_trigger: "event",
      });
      await embedAndStore(storage, embedder, target.id, target.observation);

      for (let i = 0; i < 4999; i += 1) {
        const obs = storage.createObservation({
          entity_id: entity.id,
          observation: `filler observation number ${i} about unrelated topics like coffee brewing methods`,
          source_trigger: "turn_scan",
        });
        await embedAndStore(storage, embedder, obs.id, obs.observation);
      }

      expect(storage.getObservationsByEntity(entity.id).length).toBe(5000);

      const start = performance.now();
      const results = await searchSimilarObservations(storage, embedder, "staging deploy pipeline approval", 10);
      const elapsedMs = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(200);
    },
  );
});
