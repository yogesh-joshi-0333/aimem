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
npm run test:coverage     # same suite, with a v8 coverage report (Phase 9C baseline below)
npm run test:e2e          # runs e2e tests (builds first, spawns real subprocess)
npm run test:performance  # runs the slow at-scale performance test(s) (FR-STORE-07) — real embedding model, ~30-40s
npm run test:search-quality  # runs the search-quality benchmark (Phase 9B) — real embedding model, top-1/top-5 accuracy report
npm run test:watch        # watch mode during development
```

Files matching `**/performance.integration.test.ts` and `**/search-quality-benchmark.integration.test.ts` are excluded from the default `npm test` run (see `vitest.config.ts`) because they embed real text with the real local model and take tens of seconds — too slow for the routine test loop. Both run via a shared `vitest.slow.config.ts` (180s timeouts). They still count toward "every public method has a unit test" and must pass before a phase touching performance- or search-quality-sensitive code is marked complete; run them explicitly via their npm scripts.

**Vitest CLI filter gotcha (found while adding the search-quality benchmark):** `vitest run <arg>` treats a positional argument as a **filename substring match**, not a glob — `vitest run src/**/foo.test.ts` silently matches nothing (the config's own `include`/`exclude` still apply first, and the literal `**` glob text is never expanded by vitest itself). Use a plain substring (e.g. `vitest run foo-test-name`) in npm scripts instead. This was a real, previously-unnoticed bug in `test:performance` itself — the script had silently done nothing (`No test files found, exiting with code 0`) since the slow-test exclude was added, and nobody had re-run it since to notice. Fixed for both scripts when the search-quality benchmark surfaced it.

## Coverage Baseline (Phase 9C)

`npm run test:coverage` (`@vitest/coverage-v8`, MIT-licensed, devDependency-only — verified before adding per RULES.md Rule 1) measures the fast suite (`npm test`'s scope; e2e and the two slow integration suites run as separate real-subprocess/real-model tests and are not folded into this number). Baseline established 2026-08-07, 113 tests:

| Metric | Result |
|---|---|
| Statements | 77.54% overall (near-100% in every module except `server.ts`, `resolve-project-root.ts`, `tool-schemas.ts` — see below) |
| Branches | 90.63% |
| Functions | 96.62% |

**Why the overall number looks lower than the per-module numbers suggest:** `src/server.ts` (the MCP tool-registration/wiring entry point), `mcp-server/resolve-project-root.ts`, and `mcp-server/tool-schemas.ts` (pure JSON Schema literals + description strings, no branching logic) show 0% in this report because they are only exercised through the compiled `dist/server.js` in the real-subprocess e2e suite (`npm run test:e2e`), not through the unit-test-level v8 instrumentation this report measures. This is intentional, not a gap — server wiring and static schema data are integration/e2e concerns, not unit-test concerns; the actual behavior they enable (every tool callable, every schema accepted/rejected correctly) is covered by `server.e2e.test.ts`'s 10 real MCP round-trip tests.

**Real gaps found and fixed during the 9C pass** (via inspecting per-line uncovered ranges, not blanket padding): `logger.ts` had zero tests at all (`setLogLevel` and its level-filtering branch); `ToolRouter.listTools()` was never called directly by any test; the `ObservationNotFoundError → OBSERVATION_NOT_FOUND` mapping added in Phase 9F was missing from both `tool-router.test.ts`'s classification table and `error-messages.test.ts`'s exact-text table (a doc/code drift risk per Rule 7); `StorageEngine`'s constructor had never been exercised through its parent-directory-creation branch (every existing test's temp dir already existed) or through a file that opens successfully but fails `PRAGMA integrity_check` (the only existing corruption test used garbage bytes, which fails at the earlier `new Database()` call instead — a structurally-valid-but-page-corrupted SQLite file needed to be constructed to reach the integrity_check branch specifically); `ensure-gitignore.ts`'s leading-newline-insertion branch was untested (the existing "append" test's fixture already ended in `\n`); `listEntities()` with no filter argument was never called; `searchKeyword` (Phase 9E) had no dedicated unit test at all, only indirect coverage via the hybrid-search integration test; and the embedding engine's in-flight-load-reuse path (two concurrent `embed()` calls before the first model load resolves) was untested.

**Gaps deliberately left uncovered, with reasoning** (not padding, and not silently dropped — recorded here per the "no silent caps" principle): the 48-bit rowid collision-retry loop in `vector-index.ts` (astronomically unlikely in practice, and only reachable by mocking `randomInt` to force a fake collision — not worth the brittleness); `EmbeddingEngine`'s missing-bundled-model-marker error path (would require renaming the real `models/.bundled` file mid-test-run, a shared non-isolated resource that other concurrently-running test files also depend on for their own real embedding calls — too risky to fake safely); a handful of defensive `undefined`-guard branches with no reachable path through the current public API (e.g. an observation whose parent entity has been deleted — there is no delete-entity method, so this can't currently happen; `ConflictVersioningEngine.confirmUpdate`'s analogous "conflict exists but its observation doesn't" guard is the same class).

**Regression rule:** coverage must not drop below this baseline in future phases. Re-run `npm run test:coverage` before marking a phase complete if it touched application logic (not required for pure documentation-only changes).

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
