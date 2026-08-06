# aimem — Implementation Phases

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## How To Use This File

1. Work exactly one phase at a time, top to bottom — do not start a later phase while an earlier one has unchecked boxes (RULES.md Rule 10).
2. Check a box `- [x]` only after its task's tests pass and [AGENT-LOG.md](../AGENT-LOG.md) reflects `Completed` for that task.
3. Each checkbox task is sized to roughly 1–3 hours of focused work — small enough that one agent session can complete it and update the log before context runs out.

---

## Phase 1 — Project Scaffold + MCP Server Skeleton

**Goal:** A runnable MCP server that starts over stdio and responds to `list_tools` with an empty/placeholder tool set.

**Completion criteria:** `npx aimem` (run locally via `node`) starts without error, and an MCP-compliant test client can connect and receive a `list_tools` response.

- [x] Initialize `package.json` with `"type": "module"`, `engines.node`, and the exact dependency versions from [RULES.md](../RULES.md) Rule 1.
- [x] Set up `tsconfig.json` in strict mode targeting ESM/Node 20.
- [x] Set up ESLint flat config with `@typescript-eslint`.
- [x] Create `src/` directory structure per [knowledge/coding-standards.md](../knowledge/coding-standards.md).
- [x] Implement the stdio MCP server entry point (`src/server.ts`) using `@modelcontextprotocol/sdk`, registering an empty tool list.
- [x] Implement project-root resolution logic (locate `.aimem/` relative to CWD or configured path).
- [x] Add the structured logger module (no `console.log`, respects Rule 4/security no-content-logging).
- [x] Write a smoke test that spawns the server as a subprocess and asserts a valid `list_tools` response.
- [x] Set up `vitest` config and confirm `npm test` runs the smoke test successfully.

## Phase 2 — SQLite Storage Engine + Entity/Relation Schema

**Goal:** A working storage engine that creates, migrates, and CRUDs the entity/relation/observation schema in a WAL-mode SQLite file.

**Completion criteria:** Unit tests against a real temp SQLite file pass for create/read/update on entities, relations, and observations, and `PRAGMA journal_mode` reports `wal`.

- [x] Design and write the SQL schema migration for `entities`, `relations`, `observations` tables (see [modules/storage-engine.md](../modules/storage-engine.md)).
- [x] Implement `StorageEngine` class: connection open, WAL pragma, migration runner.
- [x] Implement `.aimem/` + `memory.db` auto-creation on first write (FR-STORE-03).
- [x] Implement `.gitignore` auto-append for `.aimem/` on first init (FR-STORE-06).
- [x] Implement entity CRUD methods (`createEntity`, `getEntityByName`, `listEntities`).
- [x] Implement observation CRUD methods (`createObservation`, `getObservationsByEntity`).
- [x] Implement relation CRUD methods (`createRelation`, `getRelationsByEntity`).
- [x] Add indexes on `entities.entity_type` and `observations.entity_id` (FR-STORE-05).
- [x] Set file permissions `0600`/`0700` on db file/directory on POSIX systems (FR-SEC-05).
- [x] Write unit tests for every method above using a real temp SQLite file per test (no mocking).

## Phase 3 — sqlite-vec + Local Embedding Model Integration

**Goal:** Semantic search works fully offline using a bundled local embedding model and a `sqlite-vec` virtual table in the same database file.

**Completion criteria:** With network access disabled, an integration test embeds a set of observations and retrieves the correct top-match via vector similarity search.

- [x] Bundle the MiniLM-class ONNX model files at install time (postinstall step or package `files` inclusion) — confirm no first-run download occurs.
- [x] Implement `EmbeddingEngine` wrapping `@xenova/transformers` for local inference.
- [x] Load and register the `sqlite-vec` SQLite extension on connection open.
- [x] Create the `vec_observations` virtual table and wire it to `observations` inserts/updates.
- [x] Implement `embedAndStore(observationId, text)` on the storage/embedding boundary.
- [x] Implement `searchSimilar(queryText, limit)` returning ranked results with similarity scores.
- [x] Write an integration test that disables network access and verifies embedding + search still succeed.
- [x] Write a performance test inserting 5,000 observations and asserting search returns in under 200ms (FR-STORE-07).

## Phase 4 — Automatic Capture Tools (Three-Tier Trigger Support)

**Goal:** `memory_store` and `memory_scan` exist with tool descriptions engineered to drive event-based, turn-count-based, and context-threshold-based AI self-triggering.

**Completion criteria:** Tool schemas match [architecture/api-design.md](../architecture/api-design.md) exactly; unit tests cover salience/dedup logic and all three `source_trigger` values persist correctly.

- [x] Implement the `memory_store` tool handler (input validation, entity lookup, dedup check, write).
- [x] Implement the `memory_scan` tool handler accepting a batch of candidates and a `trigger` value.
- [x] Write the exact tool description strings for `memory_store`/`memory_scan` per [api-design.md](../architecture/api-design.md), engineered to instruct event/turn/context-threshold behavior (FR-CAPTURE-04).
- [x] Implement `source_trigger` persistence with the four exact enum values (FR-CAPTURE-05).
- [x] Implement duplicate-detection logic (skip storing near-identical existing observations).
- [x] Write unit tests for `memory_store` covering new-entity, existing-entity, and duplicate cases.
- [x] Write unit tests for `memory_scan` covering batch insert, partial duplicates, and empty-candidates rejection.

**Implementation note:** `memory_store`'s "dedup check" is entity-level idempotency (`createEntity` reuses an existing entity by name+type rather than creating a duplicate) — it always writes the observation unconditionally, matching its documented "store it the moment you notice it, don't wait" behavior and its fixed `{ id, created_at, conflict_detected }` response shape in [api-design.md](../architecture/api-design.md), which has no "skipped as duplicate" outcome. True near-duplicate observation-text skipping (`skipped_duplicates`) is `memory_scan`-only, matching its distinct batch response shape.

## Phase 5 — New-Session Pickup + Manual Override

**Goal:** `memory_get_project_context`, `memory_search`, and `memory_remember` are fully implemented and match their documented schemas.

**Completion criteria:** An e2e test simulating a new session calls `memory_get_project_context` then `memory_search` and receives correctly scoped results; `memory_remember` bypasses salience judgment.

- [x] Implement `memory_get_project_context` (summary stats query: entity count, last updated, top entities).
- [x] Implement `memory_search` with combined structured filter (`entity_type`) + vector similarity ranking.
- [x] Implement `memory_remember` (unconditional store, `source_trigger: "manual"`).
- [x] Write the tool description for `memory_get_project_context` enforcing "always call, never skip" behavior (FR-RETRIEVE-01).
- [x] Write e2e test: fresh project → no memory → populate via `memory_store` → new server process → `memory_get_project_context` reflects populated state.
- [x] Write unit tests for `memory_search` ranking and `limit`/`entity_type` filtering.

**Implementation note:** "top entities" (used by `memory_get_project_context`'s summary) is ranked by most recent observation activity (`MAX(observations.updated_at)` per entity, descending) — the module doc didn't specify a ranking signal, and recency is the most defensible interpretation for "what's relevant to announce right now."

## Phase 6 — Conflict Detection + Versioning

**Goal:** Contradicting writes are detected, require confirmation, and preserve full version history.

**Completion criteria:** A test that stores a value, then stores a contradicting value for the same entity/attribute, receives a `conflict_detected` response; confirming via `memory_confirm_update` archives the old value and increments version.

- [x] Design and add the `observation_versions` and `conflicts` tables/migration. *(done in Phase 2, migration 002-conflict-versioning.sql)*
- [x] Implement conflict-detection logic (same `entity` + `attribute`, differing `observation` value).
- [x] Implement `memory_confirm_update` tool handler (`confirm`/`reject` actions).
- [x] Implement version archival on confirm (insert into `observation_versions`, increment `version`).
- [x] Wire `memory_store` and `memory_scan` to route through conflict detection before writing.
- [x] Write unit tests for conflict detection, confirm, reject, and version increment correctness.

**Implementation notes:**
- Conflict detection only applies when `attribute` is provided — an observation with no `attribute` has nothing to compare against, so it always writes directly (matches the schema: comparison is scoped to entity+attribute, not entity alone).
- `memory_remember` (manual override) is also routed through conflict detection via `store()` — "bypasses automatic salience judgment" (FR-MANUAL-01) is about dedup/salience, not about silently overwriting a contradicting fact; Rule 11 ("never silently overwrite conflicting memory values") applies regardless of trigger source.
- Found and fixed a real timing bug while testing: `getTopEntitiesByRecentActivity` (Phase 5) had no tiebreaker for same-millisecond `updated_at` writes, making "most recent" ranking non-deterministic; fixed with a secondary `MAX(rowid) DESC` sort key (documented in [modules/storage-engine.md](../modules/storage-engine.md)).

## Phase 7 — Error Handling for Missing/Corrupted Files + Concurrency Verification

**Goal:** All documented failure modes behave exactly as specified, and concurrent access is verified safe.

**Completion criteria:** Tests confirm missing-file = silent fresh start, corrupted-file = exact error message (no data loss), and two concurrent processes writing to the same `memory.db` do not corrupt data.

- [x] Implement missing-file detection → silent fresh-database initialization (FR-ERR-01). *(implemented Phase 2; explicit e2e-level test added this phase)*
- [x] Implement corrupted-file detection (SQLite integrity check on open) → `STORAGE_CORRUPTED` error with exact message from [knowledge/error-handling.md](../knowledge/error-handling.md) (FR-ERR-02).
- [x] Implement the top-level tool-handler try/catch boundary ensuring no unhandled exception escapes (FR-ERR-03).
- [x] Audit all error paths to confirm no stack traces or absolute file paths leak into responses (FR-ERR-04).
- [x] Write a concurrency test: two `StorageEngine` instances opened on the same file, writing simultaneously, assert no corruption and both writes persist (FR-ERR-05). *(StorageEngine-level test existed from Phase 2; a full two-server-process e2e version added this phase)*
- [x] Write tests for every exact error message string in [knowledge/error-handling.md](../knowledge/error-handling.md).

**Critical bug found and fixed this phase:** the e2e-level corrupted-file test (added for FR-ERR-02) revealed that `server.ts` constructed `StorageEngine` eagerly at `startServer()` time — meaning a corrupted `.aimem/memory.db` crashed the *entire server process* at boot (visible to the AI client only as `MCP error -32000: Connection closed`), rather than surfacing the documented per-call `STORAGE_CORRUPTED` response. This directly violated Rule 9 and FR-ERR-02, and had gone undetected through Phases 1-6 because no test had previously exercised a corrupted file against the *real compiled server* (only against `StorageEngine` in isolation, where the thrown error is expected and correctly caught by the unit test itself). Fixed via `LazyServerDependencies` (deferred construction until first tool call) — see [decisions/ADR.md](../decisions/ADR.md) ADR-008 and [knowledge/error-handling.md](../knowledge/error-handling.md).

## Phase 8 — Packaging / Install / npm Publish + Cross-Client Testing + Real-World Validation

**Goal:** aimem is installable by a non-technical user via a single command and works correctly across multiple real MCP clients in real daily use.

**Completion criteria:** Fresh install on a clean machine/container succeeds via the documented command in [knowledge/setup/install-guide.md](../knowledge/setup/install-guide.md); the server is verified working end-to-end in at least two different MCP clients; the project owner has used it daily for a self-test period.

- [x] Finalize `package.json` `bin` entry, `files` allowlist, and postinstall model-bundling step.
- [x] Test `npm pack` + local global install on a clean environment.
- [x] Test `npx aimem` zero-install invocation.
- [ ] Configure aimem as an MCP server in Claude Code and verify all 6 tools appear and function. **(Requires the project owner's own machine/IDE — cannot be completed autonomously.)**
- [ ] Configure aimem as an MCP server in a second client (Cursor or Windsurf) and verify parity. **(Requires the project owner's own machine/IDE — cannot be completed autonomously.)**
- [x] Write/finalize [knowledge/setup/install-guide.md](../knowledge/setup/install-guide.md) troubleshooting entries based on real install issues found.
- [ ] Publish to npm registry (or dry-run publish if not yet public). **(Requires the project owner's own npm account/credentials, entered directly by them via `npm login` in their own terminal — never pasted into chat. Awaiting the owner's decision on whether/when to publish.)**
- [ ] Begin daily real-world personal-use validation per the Success Metrics in [requirements/PRD.md](../requirements/PRD.md); log reliability observations for the self-triggering risk noted in [implementation/estimation.md](estimation.md). **(Inherently requires the project owner's own day-to-day usage over time — cannot be done by an agent.)**

**Two critical, user-impacting bugs found and fixed during autonomous `npm pack`/global-install/`npx` testing** (neither had been caught by 7 prior phases of e2e testing against `node dist/server.js` directly, because both are specific to how real install methods invoke the binary):

1. **Missing shebang.** `src/server.ts` had no `#!/usr/bin/env node` line, so the OS could not execute the compiled `dist/server.js` as a standalone binary at all (`bin/aimem`, symlinked by npm, would fail to exec). Fixed by adding the shebang as the first line of the source file (preserved verbatim through `tsc`).
2. **`isMainModule` symlink bug (the more serious of the two).** Comparing raw `process.argv[1]` against `import.meta.url` is always false when Node is invoked through a symlink — which is exactly how `npm install -g` and `npx` both install a package's `bin` entry. The server would start, load, log nothing, and exit cleanly with code 0, completely silently, for what were meant to be the two primary documented install paths. Fixed via `realpathSync` before comparing; see [decisions/ADR.md](../decisions/ADR.md) ADR-010 for full detail and root-cause analysis. A regression e2e test (spawning the server through a freshly-created symlink) was added to `server.e2e.test.ts` and verified to fail against the pre-fix code and pass against the fix.

Also found and fixed: `scripts/bundle-embedding-model.mjs` was missing from `package.json`'s `files` allowlist, so a real installed package couldn't find its own `postinstall` script.

See also: [estimation.md](estimation.md), [../AGENT-LOG.md](../AGENT-LOG.md), [../RULES.md](../RULES.md).
