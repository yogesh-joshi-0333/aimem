import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../embedding-engine.js";
import { embedAndStore, searchSimilarObservations } from "../embedding-search-coordinator.js";

describe("Embedding + vector search integration (FR-EMBED-*)", () => {
  let dir: string;
  let storage: StorageEngine;
  let embedder: EmbeddingEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-embed-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    embedder = new EmbeddingEngine();
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores and retrieves the closest match via vector similarity search", async () => {
    const entity = storage.createEntity({ name: "staging-db", entity_type: "credential" });
    const target = storage.createObservation({
      entity_id: entity.id,
      observation: "staging database password rotated to use env var STAGING_DB_PASS",
      source_trigger: "event",
    });
    const unrelated = storage.createObservation({
      entity_id: entity.id,
      observation: "the team prefers pineapple on pizza for friday lunches",
      source_trigger: "manual",
    });

    await embedAndStore(storage, embedder, target.id, target.observation);
    await embedAndStore(storage, embedder, unrelated.id, unrelated.observation);

    const results = await searchSimilarObservations(storage, embedder, "staging db password", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.observation_id).toBe(target.id);
  });

  it("updates the embedding in place when the same observation is re-embedded", async () => {
    const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
    const obs = storage.createObservation({
      entity_id: entity.id,
      observation: "engine is MySQL",
      source_trigger: "event",
    });

    await embedAndStore(storage, embedder, obs.id, "engine is MySQL");
    await embedAndStore(storage, embedder, obs.id, "engine is PostgreSQL");

    const results = await searchSimilarObservations(storage, embedder, "PostgreSQL database engine", 1);
    expect(results[0]?.observation_id).toBe(obs.id);
  });
});
