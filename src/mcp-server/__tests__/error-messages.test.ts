import { describe, expect, it, vi } from "vitest";
import { ToolRouter } from "../tool-router.js";
import { StorageCorruptedError } from "../../storage-engine/errors.js";
import { InvalidInputError } from "../../capture-engine/errors.js";
import { ConflictNotFoundError, ObservationNotFoundError } from "../../conflict-versioning-engine/errors.js";

// These strings are copied verbatim from knowledge/error-handling.md's "Standard Error
// Messages (Exact Text)" table. If this test fails, either the code drifted from the docs
// or the docs changed without the code (or vice versa) — update both together per RULES.md
// Rule 7, never just one side.
const EXPECTED = {
  STORAGE_CORRUPTED:
    "Your project memory file (.aimem/memory.db) exists but could not be read. It may be corrupted. No data has been modified or deleted — please back up .aimem/memory.db and report this issue before continuing.",
  INVALID_INPUT:
    "The input provided to this tool is invalid or incomplete. Please check the required fields and try again.",
  CONFLICT_NOT_FOUND: "No pending memory conflict was found with the given conflict_id. It may have already been resolved.",
  OBSERVATION_NOT_FOUND: "No observation was found with the given observation_id, or it has already been invalidated.",
  INTERNAL_ERROR: "An unexpected internal error occurred in aimem. Your existing memory data has not been modified.",
};

const NOOP_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

function registerThrowingTool(router: ToolRouter, name: string, error: Error): void {
  router.registerTool({ name, description: "test tool", inputSchema: NOOP_SCHEMA }, async () => {
    throw error;
  });
}

describe("Exact error message strings (knowledge/error-handling.md)", () => {
  it("STORAGE_CORRUPTED matches the documented exact text", async () => {
    const router = new ToolRouter();
    registerThrowingTool(router, "t", new StorageCorruptedError("/some/path/.aimem/memory.db"));
    const result = await router.handleToolCall("t", {});
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.STORAGE_CORRUPTED);
    } else {
      expect.fail("expected an error response");
    }
  });

  it("INVALID_INPUT matches the documented exact text (unknown tool)", async () => {
    const router = new ToolRouter();
    const result = await router.handleToolCall("does_not_exist", {});
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.INVALID_INPUT);
    } else {
      expect.fail("expected an error response");
    }
  });

  it("INVALID_INPUT matches the documented exact text (schema validation failure)", async () => {
    const router = new ToolRouter();
    router.registerTool(
      { name: "t", description: "test", inputSchema: { type: "object", required: ["x"], properties: {} } },
      async () => ({}),
    );
    const result = await router.handleToolCall("t", {});
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.INVALID_INPUT);
    } else {
      expect.fail("expected an error response");
    }
  });

  it("INVALID_INPUT matches the documented exact text (InvalidInputError thrown)", async () => {
    const router = new ToolRouter();
    registerThrowingTool(router, "t", new InvalidInputError("empty candidates"));
    const result = await router.handleToolCall("t", {});
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.INVALID_INPUT);
    } else {
      expect.fail("expected an error response");
    }
  });

  it("CONFLICT_NOT_FOUND matches the documented exact text", async () => {
    const router = new ToolRouter();
    registerThrowingTool(router, "t", new ConflictNotFoundError("unknown-id"));
    const result = await router.handleToolCall("t", {});
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.CONFLICT_NOT_FOUND);
    } else {
      expect.fail("expected an error response");
    }
  });

  it("OBSERVATION_NOT_FOUND matches the documented exact text", async () => {
    const router = new ToolRouter();
    registerThrowingTool(router, "t", new ObservationNotFoundError("unknown-id"));
    const result = await router.handleToolCall("t", {});
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.OBSERVATION_NOT_FOUND);
    } else {
      expect.fail("expected an error response");
    }
  });

  it("INTERNAL_ERROR matches the documented exact text (unclassified error)", async () => {
    const router = new ToolRouter();
    registerThrowingTool(router, "t", new Error("anything unclassified"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await router.handleToolCall("t", {});
    logSpy.mockRestore();
    if (!result.success) {
      expect(result.error.message).toBe(EXPECTED.INTERNAL_ERROR);
    } else {
      expect.fail("expected an error response");
    }
  });
});
