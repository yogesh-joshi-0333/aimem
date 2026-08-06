import { describe, expect, it } from "vitest";
import { isDuplicate, stringSimilarity } from "../dedup.js";
import type { ObservationRecord } from "../../storage-engine/types.js";

function makeObservation(observation: string): ObservationRecord {
  return {
    id: "test-id",
    entity_id: "test-entity",
    attribute: null,
    observation,
    confidence: 1,
    source_trigger: "event",
    version: 1,
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
  };
}

describe("stringSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(stringSimilarity("staging DB password", "staging DB password")).toBe(1);
  });

  it("returns 1 for strings differing only by case/whitespace", () => {
    expect(stringSimilarity("Staging DB Password", "  staging   db password  ")).toBe(1);
  });

  it("returns a low score for unrelated strings", () => {
    expect(stringSimilarity("staging database password", "the team likes pizza")).toBeLessThan(0.5);
  });
});

describe("isDuplicate", () => {
  it("detects an exact-match duplicate against existing observations", () => {
    const existing = [makeObservation("staging DB password rotated")];
    expect(isDuplicate("staging DB password rotated", existing)).toBe(true);
  });

  it("detects a near-duplicate with minor wording differences", () => {
    const existing = [makeObservation("staging db password rotated")];
    expect(isDuplicate("Staging DB Password Rotated", existing)).toBe(true);
  });

  it("does not flag unrelated observations as duplicates", () => {
    const existing = [makeObservation("staging db password rotated")];
    expect(isDuplicate("primary database engine switched to PostgreSQL", existing)).toBe(false);
  });

  it("returns false when there are no existing observations", () => {
    expect(isDuplicate("anything", [])).toBe(false);
  });
});
