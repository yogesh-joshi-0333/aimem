# aimem — Testing Guide

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Testing Rules

- Never mock the SQLite storage layer. Every test that touches storage uses a real temporary SQLite file created fresh for that test (e.g. via `os.tmpdir()` + a unique subdirectory), and deletes it in an `afterEach`.
- Never mock the MCP stdio transport in end-to-end tests — spawn the actual compiled server as a child process and speak real JSON-RPC to it.
- Never mock the embedding model in integration/e2e tests that specifically validate semantic search — use the real bundled model. Unit tests for unrelated logic (e.g. conflict detection string comparison) may stub embedding output to isolate that logic.
- Every public method on every class in `src/*/*.ts` must have at least one unit test.
- Tests must be deterministic — no reliance on wall-clock timing beyond generous timeouts for model load in e2e tests.

## Test Types

| Type | Scope | What to test |
|---|---|---|
| Unit | A single class/function in isolation, real SQLite temp file, no process spawn | Individual method behavior: CRUD correctness, validation logic, conflict-detection comparison logic, error classification |
| Integration | Two or more real modules wired together (e.g. StorageEngine + EmbeddingEngine), no full MCP transport | Cross-module data flow: embed-then-store-then-search round trip, migration application, WAL mode confirmation |
| E2E | Full server spawned as a subprocess, real MCP JSON-RPC over stdio | Full tool-call lifecycle: `list_tools`, each tool's success/error response shape, new-session pickup round trip, concurrency across two spawned processes |

## What To Test Per Type — Examples

**Unit** (`src/storage-engine/__tests__/storage-engine.test.ts`):

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageEngine } from "../storage-engine.js";

describe("StorageEngine.createEntity", () => {
  let dir: string;
  let engine: StorageEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-test-"));
    engine = new StorageEngine(join(dir, "memory.db"));
  });

  afterEach(() => {
    engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates and retrieves an entity by name", () => {
    const created = engine.createEntity({ name: "staging-db", entity_type: "credential" });
    const found = engine.getEntityByName("staging-db");
    expect(found?.id).toBe(created.id);
  });
});
```

**Integration** (`src/embedding-search-engine/__tests__/embedding-search.integration.test.ts`):

```typescript
it("stores and retrieves the closest match via vector search with network disabled", async () => {
  const engine = new StorageEngine(dbPath);
  const embedder = new EmbeddingEngine();
  const text = "staging database password rotated";
  const obs = engine.createObservation({ entity_id, observation: text });
  await embedder.embedAndStore(engine, obs.id, text);

  const results = await embedder.searchSimilar(engine, "staging db password", 5);
  expect(results[0]?.observation).toBe(text);
});
```

**E2E** (`src/mcp-server/__tests__/server.e2e.test.ts`):

```typescript
it("responds to memory_get_project_context on a fresh project with no error", async () => {
  const client = await spawnTestServer(tmpProjectDir);
  const response = await client.callTool("memory_get_project_context", {});
  expect(response.success).toBe(true);
  expect(response.data.has_memory).toBe(false);
  await client.close();
});
```

## How To Run Tests

```bash
npm test                  # runs all unit + integration tests via vitest (fast; excludes slow tests below)
npm run test:e2e          # runs e2e tests (builds first, spawns real subprocess)
npm run test:performance  # runs the slow at-scale performance test(s) (FR-STORE-07) — real embedding model, ~30-40s
npm run test:search-quality  # runs the search-quality benchmark (Phase 9B) — real embedding model, top-1/top-5 accuracy report
npm run test:watch        # watch mode during development
```

Files matching `**/performance.integration.test.ts` and `**/search-quality-benchmark.integration.test.ts` are excluded from the default `npm test` run (see `vitest.config.ts`) because they embed real text with the real local model and take tens of seconds — too slow for the routine test loop. Both run via a shared `vitest.slow.config.ts` (180s timeouts). They still count toward "every public method has a unit test" and must pass before a phase touching performance- or search-quality-sensitive code is marked complete; run them explicitly via their npm scripts.

**Vitest CLI filter gotcha (found while adding the search-quality benchmark):** `vitest run <arg>` treats a positional argument as a **filename substring match**, not a glob — `vitest run src/**/foo.test.ts` silently matches nothing (the config's own `include`/`exclude` still apply first, and the literal `**` glob text is never expanded by vitest itself). Use a plain substring (e.g. `vitest run foo-test-name`) in npm scripts instead. This was a real, previously-unnoticed bug in `test:performance` itself — the script had silently done nothing (`No test files found, exiting with code 0`) since the slow-test exclude was added, and nobody had re-run it since to notice. Fixed for both scripts when the search-quality benchmark surfaced it.

## E2E Test Isolation

Every e2e test MUST spawn the compiled server with `cwd` set to a freshly created temp directory (`mkdtempSync` + `os.tmpdir()`), passed via `StdioClientTransport`'s `cwd` option, and clean it up in `afterEach`. The server resolves its project root (and therefore `.aimem/memory.db`) from its own CWD — an e2e test that omits `cwd` will spawn the server against the aimem repo's own working directory and create a real `.aimem/` folder there as a side effect of testing. This was found and fixed during Phase 4 (the very first e2e test predated real tools being registered and used the default CWD; it was harmless while the tool set was empty, but became a real repo-pollution bug once `memory_store`/`memory_scan` started actually writing to disk).

## Test File Naming / Location Conventions

| Type | Location | Naming |
|---|---|---|
| Unit | `src/<module>/__tests__/<subject>.test.ts` | `storage-engine.test.ts` |
| Integration | `src/<module>/__tests__/<subject>.integration.test.ts` | `embedding-search.integration.test.ts` |
| E2E | `src/mcp-server/__tests__/<subject>.e2e.test.ts` | `server.e2e.test.ts` |

## Pre-Completion Checklist

- [ ] Every new/changed public method has a unit test
- [ ] No storage/network/transport mocking violates the rules above
- [ ] `npm test` and `npm run test:e2e` both pass locally
- [ ] New error cases have a test asserting the exact message string from [error-handling.md](error-handling.md)
- [ ] Concurrency-sensitive changes have a test with two simultaneous connections, if applicable

See also: [coding-standards.md](coding-standards.md), [../RULES.md](../RULES.md) Rule 6.
