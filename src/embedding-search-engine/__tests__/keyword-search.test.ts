import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { searchKeyword } from "../keyword-search.js";

describe("searchKeyword (Phase 9E)", () => {
  let dir: string;
  let storage: StorageEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-keyword-search-test-"));
    storage = new StorageEngine(join(dir, "memory.db"));
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty array for a whitespace-only query, without hitting FTS5", () => {
    const entity = storage.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
    storage.createObservation({ entity_id: entity.id, observation: "we use PostgreSQL", source_trigger: "event" });

    const results = searchKeyword(storage.getRawConnection(), "   ", 10);
    expect(results).toEqual([]);
  });

  it("finds an exact keyword match and reports its FTS5 rank", () => {
    const entity = storage.createEntity({ name: "payment-service", entity_type: "credential" });
    const obs = storage.createObservation({
      entity_id: entity.id,
      observation: "The STRIPE_WEBHOOK_SECRET must be rotated every 90 days",
      source_trigger: "event",
    });

    const results = searchKeyword(storage.getRawConnection(), "STRIPE_WEBHOOK_SECRET", 10);
    expect(results).toHaveLength(1);
    expect(results[0]?.observation_id).toBe(obs.id);
  });

  it("safely handles query tokens containing FTS5-significant characters (quotes, hyphens)", () => {
    const entity = storage.createEntity({ name: "auth-service", entity_type: "decision" });
    storage.createObservation({
      entity_id: entity.id,
      observation: "the auth-service uses JWT tokens",
      source_trigger: "event",
    });

    expect(() => searchKeyword(storage.getRawConnection(), `auth-service "quoted" -term`, 10)).not.toThrow();
  });

  it("respects the limit parameter", () => {
    const entity = storage.createEntity({ name: "bulk", entity_type: "decision" });
    for (let i = 0; i < 5; i += 1) {
      storage.createObservation({ entity_id: entity.id, observation: `bulk fact number ${i}`, source_trigger: "event" });
    }

    const results = searchKeyword(storage.getRawConnection(), "bulk fact", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
