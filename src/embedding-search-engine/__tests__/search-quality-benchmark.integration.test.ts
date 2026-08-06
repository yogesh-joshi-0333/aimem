import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StorageEngine } from "../../storage-engine/storage-engine.js";
import { EmbeddingEngine } from "../embedding-engine.js";
import { embedAndStore, searchSimilarObservations } from "../embedding-search-coordinator.js";
import { BENCHMARK_FIXTURES, DISTRACTOR_OBSERVATIONS } from "./fixtures/search-quality-benchmark.js";

/**
 * Search-quality benchmark (Phase 9B). Measures how often memory_search's
 * underlying vector search returns the CORRECT stored fact for a realistic
 * natural-language query, among a store that also contains distractor facts
 * on similar topics.
 *
 * This is the baseline this project should diff future embedding-model
 * changes against — see docs/implementation/phases.md Phase 9B and
 * docs/decisions/ADR.md ADR-015. Run standalone via:
 *   npx vitest run src/embedding-search-engine/__tests__/search-quality-benchmark.integration.test.ts
 *
 * Not included in the default `npm test` run (see vitest.config.ts) because
 * it embeds ~20 real observations with the real local model — a few seconds
 * slower than the fast suite, same category as performance.integration.test.ts.
 */

interface QueryResult {
  readonly fixtureId: string;
  readonly query: string;
  readonly top1Hit: boolean;
  readonly top5Hit: boolean;
  readonly rank: number | undefined; // 1-indexed rank of the correct result, undefined if not in top 5
}

describe("Search quality benchmark (Phase 9B baseline)", () => {
  let dir: string;
  let storage: StorageEngine;
  let embedder: EmbeddingEngine;
  const observationIdByFixtureId = new Map<string, string>();

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "aimem-search-benchmark-"));
    storage = new StorageEngine(join(dir, "memory.db"));
    embedder = new EmbeddingEngine();

    for (const fixture of BENCHMARK_FIXTURES) {
      const entity = storage.createEntity({ name: fixture.entity, entity_type: fixture.category });
      const observation = storage.createObservation({
        entity_id: entity.id,
        observation: fixture.observation,
        source_trigger: "manual",
      });
      observationIdByFixtureId.set(fixture.id, observation.id);
      await embedAndStore(storage, embedder, observation.id, observation.observation);
    }

    for (const distractor of DISTRACTOR_OBSERVATIONS) {
      const entity = storage.createEntity({ name: distractor.entity, entity_type: "architecture_fact" });
      const observation = storage.createObservation({
        entity_id: entity.id,
        observation: distractor.observation,
        source_trigger: "manual",
      });
      await embedAndStore(storage, embedder, observation.id, observation.observation);
    }
  }, 120000);

  afterAll(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports top-1 and top-5 accuracy across all fixture queries", async () => {
    const results: QueryResult[] = [];

    for (const fixture of BENCHMARK_FIXTURES) {
      const expectedObservationId = observationIdByFixtureId.get(fixture.id);
      if (expectedObservationId === undefined) {
        throw new Error(`Fixture setup failed for ${fixture.id}`);
      }

      for (const query of fixture.queries) {
        const matches = await searchSimilarObservations(storage, embedder, query, 5);
        const rankIndex = matches.findIndex((m) => m.observation_id === expectedObservationId);
        const rank = rankIndex === -1 ? undefined : rankIndex + 1;

        results.push({
          fixtureId: fixture.id,
          query,
          top1Hit: rank === 1,
          top5Hit: rank !== undefined,
          rank,
        });
      }
    }

    const totalQueries = results.length;
    const top1Hits = results.filter((r) => r.top1Hit).length;
    const top5Hits = results.filter((r) => r.top5Hit).length;
    const top1Accuracy = top1Hits / totalQueries;
    const top5Accuracy = top5Hits / totalQueries;

    const misses = results.filter((r) => !r.top5Hit);
    const top5ButNot1 = results.filter((r) => r.top5Hit && !r.top1Hit);

    const reportLines = [
      "",
      `Search quality benchmark (${totalQueries} queries, all-MiniLM-L6-v2):`,
      `  Top-1 accuracy: ${(top1Accuracy * 100).toFixed(1)}% (${top1Hits}/${totalQueries})`,
      `  Top-5 accuracy: ${(top5Accuracy * 100).toFixed(1)}% (${top5Hits}/${totalQueries})`,
      ...(top5ButNot1.length > 0
        ? [
            `  In top-5 but not top-1 (${top5ButNot1.length}):`,
            ...top5ButNot1.map((r) => `    "${r.query}" -> rank ${r.rank} (expected: ${r.fixtureId})`),
          ]
        : []),
      ...(misses.length > 0
        ? [
            `  Missed entirely (not in top-5) (${misses.length}):`,
            ...misses.map((r) => `    "${r.query}" (expected: ${r.fixtureId})`),
          ]
        : []),
    ];
    // eslint-disable-next-line no-console -- benchmark report output, intentional and test-only, not a runtime code path
    console.log(reportLines.join("\n"));

    // Baseline assertions: this benchmark exists to measure and track accuracy over
    // time (see Phase 9B), not to gate CI on an arbitrary threshold from day one.
    // These are deliberately loose — tightened once a real baseline is recorded.
    expect(totalQueries).toBeGreaterThan(0);
    expect(top5Accuracy).toBeGreaterThan(0.5);
  }, 180000);
});
