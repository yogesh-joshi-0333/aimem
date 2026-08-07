import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, MAX_OBSERVATION_LENGTH, MAX_SCAN_CANDIDATES } from "../../config.js";
import {
  MEMORY_CONFIRM_UPDATE_SCHEMA,
  MEMORY_INVALIDATE_SCHEMA,
  MEMORY_REMEMBER_SCHEMA,
  MEMORY_SCAN_SCHEMA,
  MEMORY_SEARCH_SCHEMA,
  MEMORY_STORE_SCHEMA,
} from "../tool-schemas.js";

// Post-launch hardening pass: every free-text field must have a maxLength, and
// memory_scan's candidates array must have a maxItems, so a single tool call can't be
// used to store an unbounded amount of data or force an unbounded amount of per-candidate
// work (memory_scan runs O(n*m) dedup comparisons against existing observations per
// candidate -- see capture-engine/dedup.ts).
const ajv = new Ajv({ allErrors: true, strict: false });

describe("tool schema input-size ceilings (post-launch hardening)", () => {
  it("memory_store rejects an observation longer than MAX_OBSERVATION_LENGTH", () => {
    const validate = ajv.compile(MEMORY_STORE_SCHEMA);
    const tooLong = "a".repeat(MAX_OBSERVATION_LENGTH + 1);
    const valid = validate({
      entity: "e",
      entity_type: "t",
      observation: tooLong,
      source_trigger: "event",
    });
    expect(valid).toBe(false);
  });

  it("memory_store rejects an entity name longer than MAX_NAME_LENGTH", () => {
    const validate = ajv.compile(MEMORY_STORE_SCHEMA);
    const tooLong = "a".repeat(MAX_NAME_LENGTH + 1);
    const valid = validate({
      entity: tooLong,
      entity_type: "t",
      observation: "fine",
      source_trigger: "event",
    });
    expect(valid).toBe(false);
  });

  it("memory_store accepts values right at the boundary", () => {
    const validate = ajv.compile(MEMORY_STORE_SCHEMA);
    const valid = validate({
      entity: "a".repeat(MAX_NAME_LENGTH),
      entity_type: "t",
      observation: "a".repeat(MAX_OBSERVATION_LENGTH),
      source_trigger: "event",
    });
    expect(valid).toBe(true);
  });

  it("memory_scan rejects more candidates than MAX_SCAN_CANDIDATES", () => {
    const validate = ajv.compile(MEMORY_SCAN_SCHEMA);
    const candidates = Array.from({ length: MAX_SCAN_CANDIDATES + 1 }, (_, i) => ({
      entity: `e${i}`,
      entity_type: "t",
      observation: "fact",
    }));
    const valid = validate({ trigger: "turn_scan", candidates });
    expect(valid).toBe(false);
  });

  it("memory_scan accepts exactly MAX_SCAN_CANDIDATES candidates", () => {
    const validate = ajv.compile(MEMORY_SCAN_SCHEMA);
    const candidates = Array.from({ length: MAX_SCAN_CANDIDATES }, (_, i) => ({
      entity: `e${i}`,
      entity_type: "t",
      observation: "fact",
    }));
    const valid = validate({ trigger: "turn_scan", candidates });
    expect(valid).toBe(true);
  });

  it("memory_scan rejects a candidate observation longer than MAX_OBSERVATION_LENGTH", () => {
    const validate = ajv.compile(MEMORY_SCAN_SCHEMA);
    const valid = validate({
      trigger: "turn_scan",
      candidates: [{ entity: "e", entity_type: "t", observation: "a".repeat(MAX_OBSERVATION_LENGTH + 1) }],
    });
    expect(valid).toBe(false);
  });

  it("memory_search rejects a query longer than MAX_OBSERVATION_LENGTH", () => {
    const validate = ajv.compile(MEMORY_SEARCH_SCHEMA);
    const valid = validate({ query: "a".repeat(MAX_OBSERVATION_LENGTH + 1) });
    expect(valid).toBe(false);
  });

  it("memory_remember rejects an observation longer than MAX_OBSERVATION_LENGTH", () => {
    const validate = ajv.compile(MEMORY_REMEMBER_SCHEMA);
    const valid = validate({ entity: "e", entity_type: "t", observation: "a".repeat(MAX_OBSERVATION_LENGTH + 1) });
    expect(valid).toBe(false);
  });

  it("memory_confirm_update rejects a conflict_id longer than MAX_NAME_LENGTH", () => {
    const validate = ajv.compile(MEMORY_CONFIRM_UPDATE_SCHEMA);
    const valid = validate({ conflict_id: "a".repeat(MAX_NAME_LENGTH + 1), action: "confirm" });
    expect(valid).toBe(false);
  });

  it("memory_invalidate rejects an observation_id longer than MAX_NAME_LENGTH", () => {
    const validate = ajv.compile(MEMORY_INVALIDATE_SCHEMA);
    const valid = validate({ observation_id: "a".repeat(MAX_NAME_LENGTH + 1) });
    expect(valid).toBe(false);
  });
});
