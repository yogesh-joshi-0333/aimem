import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../embedding-engine.js";
import { embedAndStore, searchHybridObservations } from "../embedding-search-coordinator.js";

describe("Hybrid search (Phase 9E — vector + FTS5 fusion)", () => {
  let dir: string;
  let storage: StorageEngine;
  let embedder: EmbeddingEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-hybrid-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    embedder = new EmbeddingEngine();
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("surfaces an exact identifier match via keyword search even when phrased identically to a semantic distractor", async () => {
    const entity = storage.createEntity({ name: "payment-service", entity_type: "credential" });
    const target = storage.createObservation({
      entity_id: entity.id,
      observation: "The STRIPE_WEBHOOK_SECRET environment variable must be rotated every 90 days.",
      source_trigger: "event",
    });
    await embedAndStore(storage, embedder, target.id, target.observation);

    const distractor = storage.createObservation({
      entity_id: entity.id,
      observation: "Payment processing secrets should be rotated on a regular schedule for security.",
      source_trigger: "event",
    });
    await embedAndStore(storage, embedder, distractor.id, distractor.observation);

    const results = await searchHybridObservations(storage, embedder, "STRIPE_WEBHOOK_SECRET", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.observation_id).toBe(target.id);
  });

  it("returns results even when only vector search would have matched (no keyword overlap)", async () => {
    const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
    const target = storage.createObservation({
      entity_id: entity.id,
      observation: "We migrated the primary datastore engine to PostgreSQL for better JSON support.",
      source_trigger: "event",
    });
    await embedAndStore(storage, embedder, target.id, target.observation);

    const results = await searchHybridObservations(storage, embedder, "what database do we use", 5);

    expect(results.some((r) => r.observation_id === target.id)).toBe(true);
  });

  it("truncates the fused result set to the requested limit", async () => {
    const entity = storage.createEntity({ name: "bulk", entity_type: "decision" });
    for (let i = 0; i < 10; i += 1) {
      const obs = storage.createObservation({
        entity_id: entity.id,
        observation: `bulk fact number ${i} about testing limits`,
        source_trigger: "event",
      });
      await embedAndStore(storage, embedder, obs.id, obs.observation);
    }

    const results = await searchHybridObservations(storage, embedder, "bulk fact about testing limits", 3);

    expect(results.length).toBe(3);
  });

  it("returns an empty array when the store has no observations", async () => {
    const results = await searchHybridObservations(storage, embedder, "anything", 5);
    expect(results).toEqual([]);
  });
});
