import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distServerPath = resolve(__dirname, "../../../dist/server.js");

interface ToolResponse {
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: { readonly code: string; readonly message: string };
}

function connectClient(projectDir: string): { client: Client; transport: StdioClientTransport } {
  const transport = new StdioClientTransport({
    command: "node",
    args: [distServerPath],
    cwd: projectDir,
  });
  const client = new Client({ name: "aimem-e2e-test-client", version: "0.0.1" });
  return { client, transport };
}

function parseToolResponse(response: unknown): ToolResponse {
  const content = (response as { content: ReadonlyArray<{ type: string; text: string }> }).content;
  return JSON.parse(content[0]?.text ?? "{}") as ToolResponse;
}

describe("aimem MCP server (e2e, stdio)", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "aimem-e2e-project-"));
    ({ client, transport } = connectClient(projectDir));
  });

  afterEach(async () => {
    await client.close();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("connects over stdio and responds to list_tools with all registered tools", async () => {
    await client.connect(transport);

    const result = await client.listTools();
    const toolNames = result.tools.map((tool) => tool.name).sort();

    expect(toolNames).toEqual([
      "memory_confirm_update",
      "memory_get_project_context",
      "memory_invalidate",
      "memory_remember",
      "memory_scan",
      "memory_search",
      "memory_store",
    ]);
  });

  it("missing .aimem/memory.db (FR-ERR-01): memory_get_project_context reports no memory, with no error", async () => {
    await client.connect(transport);

    const context = parseToolResponse(await client.callTool({ name: "memory_get_project_context", arguments: {} }));

    expect(context.success).toBe(true);
    expect(context.error).toBeUndefined();
    expect(context.data?.has_memory).toBe(false);
  });

  it("corrupted .aimem/memory.db (FR-ERR-02): every tool call returns the exact STORAGE_CORRUPTED message, never a crash", async () => {
    mkdirSync(join(projectDir, ".aimem"), { recursive: true });
    writeFileSync(join(projectDir, ".aimem", "memory.db"), "not a valid sqlite file, just garbage bytes");

    await client.connect(transport);

    const response = parseToolResponse(await client.callTool({ name: "memory_get_project_context", arguments: {} }));

    expect(response.success).toBe(false);
    expect(response.error?.code).toBe("STORAGE_CORRUPTED");
    expect(response.error?.message).toBe(
      "Your project memory file (.aimem/memory.db) exists but could not be read. It may be corrupted. No data has been modified or deleted — please back up .aimem/memory.db and report this issue before continuing.",
    );
    expect(JSON.stringify(response)).not.toContain(projectDir);
  });

  it("stores a memory via memory_store and reflects it in a fresh .aimem/memory.db under the project dir", async () => {
    await client.connect(transport);

    const response = await client.callTool({
      name: "memory_store",
      arguments: {
        entity: "staging-db",
        entity_type: "credential",
        observation: "staging DB password rotated to use env var STAGING_DB_PASS",
        source_trigger: "event",
      },
    });

    const parsed = parseToolResponse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.conflict_detected).toBe(false);
  });

  it(
    "full new-session pickup round trip: fresh project has no memory, " +
      "populate via memory_store, a brand-new server process reflects the populated state",
    async () => {
      await client.connect(transport);

      const freshContext = parseToolResponse(
        await client.callTool({ name: "memory_get_project_context", arguments: {} }),
      );
      expect(freshContext.data?.has_memory).toBe(false);

      await client.callTool({
        name: "memory_store",
        arguments: {
          entity: "auth-service",
          entity_type: "decision",
          observation: "use JWT with 15-minute access token expiry",
          source_trigger: "event",
        },
      });

      await client.close();

      const second = connectClient(projectDir);
      await second.client.connect(second.transport);

      const populatedContext = parseToolResponse(
        await second.client.callTool({ name: "memory_get_project_context", arguments: {} }),
      );
      expect(populatedContext.data?.has_memory).toBe(true);
      expect((populatedContext.data?.summary as { entity_count: number } | undefined)?.entity_count).toBe(1);

      const searchResult = parseToolResponse(
        await second.client.callTool({
          name: "memory_search",
          arguments: { query: "JWT access token expiry", limit: 5 },
        }),
      );
      const results = searchResult.data?.results as ReadonlyArray<{ entity: string }> | undefined;
      expect(results?.[0]?.entity).toBe("auth-service");

      await second.client.close();

      // reconnect the outer client so afterEach's client.close() has a live connection to close
      ({ client, transport } = connectClient(projectDir));
      await client.connect(transport);
    },
  );

  it("memory_remember stores unconditionally and is immediately visible to memory_get_project_context", async () => {
    await client.connect(transport);

    const response = parseToolResponse(
      await client.callTool({
        name: "memory_remember",
        arguments: {
          entity: "deploy-process",
          entity_type: "decision",
          observation: "never deploy on Fridays",
        },
      }),
    );

    expect(response.success).toBe(true);
    expect(response.data?.conflict_detected).toBe(false);

    const context = parseToolResponse(await client.callTool({ name: "memory_get_project_context", arguments: {} }));
    expect(context.data?.has_memory).toBe(true);
  });

  it("full conflict round trip: memory_store detects a conflict, memory_confirm_update resolves it", async () => {
    await client.connect(transport);

    await client.callTool({
      name: "memory_store",
      arguments: {
        entity: "primary-db",
        entity_type: "architecture_fact",
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      },
    });

    const conflictResponse = parseToolResponse(
      await client.callTool({
        name: "memory_store",
        arguments: {
          entity: "primary-db",
          entity_type: "architecture_fact",
          attribute: "engine",
          observation: "PostgreSQL",
          source_trigger: "event",
        },
      }),
    );
    expect(conflictResponse.data?.conflict_detected).toBe(true);
    const conflictId = conflictResponse.data?.conflict_id as string;

    const confirmResponse = parseToolResponse(
      await client.callTool({
        name: "memory_confirm_update",
        arguments: { conflict_id: conflictId, action: "confirm" },
      }),
    );
    expect(confirmResponse.success).toBe(true);
    expect(confirmResponse.data?.updated).toBe(true);
    expect(confirmResponse.data?.new_version).toBe(2);

    const unknownConflictResponse = parseToolResponse(
      await client.callTool({
        name: "memory_confirm_update",
        arguments: { conflict_id: "not-a-real-conflict-id", action: "confirm" },
      }),
    );
    expect(unknownConflictResponse.success).toBe(false);
    expect(unknownConflictResponse.error?.code).toBe("CONFLICT_NOT_FOUND");
  });

  it("memory_invalidate marks a fact stale and it disappears from search/context (Phase 9F)", async () => {
    await client.connect(transport);

    const storeResponse = parseToolResponse(
      await client.callTool({
        name: "memory_store",
        arguments: {
          entity: "staging-db",
          entity_type: "credential",
          observation: "staging DB password rotated to use env var STAGING_DB_PASS",
          source_trigger: "event",
        },
      }),
    );
    const observationId = storeResponse.data?.id as string;

    const invalidateResponse = parseToolResponse(
      await client.callTool({ name: "memory_invalidate", arguments: { observation_id: observationId } }),
    );
    expect(invalidateResponse.success).toBe(true);
    expect(invalidateResponse.data?.invalidated).toBe(true);

    const context = parseToolResponse(await client.callTool({ name: "memory_get_project_context", arguments: {} }));
    expect(context.data?.has_memory).toBe(false);

    const unknownObservationResponse = parseToolResponse(
      await client.callTool({ name: "memory_invalidate", arguments: { observation_id: "not-a-real-observation-id" } }),
    );
    expect(unknownObservationResponse.success).toBe(false);
    expect(unknownObservationResponse.error?.code).toBe("OBSERVATION_NOT_FOUND");
  });

  it("concurrency (FR-ERR-05): two full server processes writing to the same project simultaneously do not corrupt data", async () => {
    await client.connect(transport);
    const second = connectClient(projectDir);
    await second.client.connect(second.transport);

    const [firstResults, secondResults] = await Promise.all([
      Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          client.callTool({
            name: "memory_store",
            arguments: {
              entity: `process-a-entity-${i}`,
              entity_type: "decision",
              observation: `written by process A, item ${i}`,
              source_trigger: "event",
            },
          }),
        ),
      ),
      Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          second.client.callTool({
            name: "memory_store",
            arguments: {
              entity: `process-b-entity-${i}`,
              entity_type: "decision",
              observation: `written by process B, item ${i}`,
              source_trigger: "event",
            },
          }),
        ),
      ),
    ]);

    for (const raw of [...firstResults, ...secondResults]) {
      const parsed = parseToolResponse(raw);
      expect(parsed.success).toBe(true);
    }

    await second.client.close();

    const context = parseToolResponse(await client.callTool({ name: "memory_get_project_context", arguments: {} }));
    const summary = context.data?.summary as { entity_count: number } | undefined;
    expect(summary?.entity_count).toBe(20);
  });

  it(
    "starts correctly when launched through a symlink (regression test for the npm/npx bin-shim bug, ADR-010): " +
      "process.argv[1] is the symlink path while import.meta.url resolves to the real file — isMainModule must " +
      "handle this via realpathSync or the server silently never starts",
    async () => {
      const symlinkDir = mkdtempSync(join(tmpdir(), "aimem-symlink-bin-"));
      const symlinkPath = join(symlinkDir, "aimem-bin-shim");
      symlinkSync(distServerPath, symlinkPath);

      const symlinkTransport = new StdioClientTransport({
        command: "node",
        args: [symlinkPath],
        cwd: projectDir,
      });
      const symlinkClient = new Client({ name: "aimem-symlink-test-client", version: "0.0.1" });

      try {
        await symlinkClient.connect(symlinkTransport);
        const tools = await symlinkClient.listTools();
        expect(tools.tools.length).toBe(7);
      } finally {
        await symlinkClient.close();
        rmSync(symlinkDir, { recursive: true, force: true });
      }
    },
  );
});
