import { describe, expect, it, vi } from "vitest";
import { ToolRouter } from "../tool-router.js";
import { StorageCorruptedError } from "../../storage-engine/errors.js";
import { InvalidInputError } from "../../capture-engine/errors.js";
import { ConflictNotFoundError, ObservationNotFoundError } from "../../conflict-versioning-engine/errors.js";
import { EmbeddingModelUnavailableError } from "../../embedding-search-engine/errors.js";

const NOOP_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

function registerThrowingTool(router: ToolRouter, name: string, error: Error): void {
  router.registerTool({ name, description: "test tool", inputSchema: NOOP_SCHEMA }, async () => {
    throw error;
  });
}

describe("ToolRouter", () => {
  describe("basic dispatch", () => {
    it("returns INVALID_INPUT for an unknown tool name", async () => {
      const router = new ToolRouter();
      const result = await router.handleToolCall("nonexistent_tool", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });

    it("returns INVALID_INPUT when input fails schema validation", async () => {
      const router = new ToolRouter();
      router.registerTool(
        {
          name: "strict_tool",
          description: "test",
          inputSchema: { type: "object", required: ["x"], properties: { x: { type: "string" } } },
        },
        async () => ({ ok: true }),
      );
      const result = await router.handleToolCall("strict_tool", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });

    it("returns success with the handler's data on a valid call", async () => {
      const router = new ToolRouter();
      router.registerTool({ name: "ok_tool", description: "test", inputSchema: NOOP_SCHEMA }, async () => ({
        value: 42,
      }));
      const result = await router.handleToolCall("ok_tool", {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ value: 42 });
      }
    });

    it("listTools returns the definition of every registered tool", () => {
      const router = new ToolRouter();
      router.registerTool({ name: "tool_a", description: "first", inputSchema: NOOP_SCHEMA }, async () => ({}));
      router.registerTool({ name: "tool_b", description: "second", inputSchema: NOOP_SCHEMA }, async () => ({}));

      const definitions = router.listTools();
      expect(definitions.map((d) => d.name).sort()).toEqual(["tool_a", "tool_b"]);
    });
  });

  describe("error classification and FR-ERR-04 (no leaked internals)", () => {
    it.each([
      { ErrorClass: StorageCorruptedError, ctorArg: "/home/someuser/secret-project/.aimem/memory.db", code: "STORAGE_CORRUPTED" },
      { ErrorClass: InvalidInputError, ctorArg: "some internal reason", code: "INVALID_INPUT" },
      { ErrorClass: ConflictNotFoundError, ctorArg: "conflict-abc-123", code: "CONFLICT_NOT_FOUND" },
      { ErrorClass: ObservationNotFoundError, ctorArg: "observation-abc-123", code: "OBSERVATION_NOT_FOUND" },
      { ErrorClass: EmbeddingModelUnavailableError, ctorArg: "ENOENT: /home/someuser/secret-project/models/foo.onnx", code: "INTERNAL_ERROR" },
    ])("maps $ErrorClass.name to code $code without leaking the constructor argument", async ({ ErrorClass, ctorArg, code }) => {
      const router = new ToolRouter();
      registerThrowingTool(router, "throwing_tool", new ErrorClass(ctorArg));

      const result = await router.handleToolCall("throwing_tool", {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(code);
        expect(result.error.message).not.toContain(ctorArg);
        expect(result.error.message).not.toContain("/home/");
        expect(JSON.stringify(result)).not.toContain("at ");
      }
    });

    it("maps a generic unclassified Error to INTERNAL_ERROR without leaking its message or stack", async () => {
      const router = new ToolRouter();
      const secretDetail = "raw internal detail with /absolute/path/that/must/not/leak and a stack trace look-alike";
      registerThrowingTool(router, "throwing_tool", new Error(secretDetail));

      const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const result = await router.handleToolCall("throwing_tool", {});
      logSpy.mockRestore();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("INTERNAL_ERROR");
        expect(result.error.message).not.toContain(secretDetail);
        expect(result.error.message).not.toContain("/absolute/path");
      }
      expect(Object.keys(result)).toEqual(["success", "error"]);
      if (!result.success) {
        expect(Object.keys(result.error)).toEqual(["code", "message"]);
      }
    });
  });
});
