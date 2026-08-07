# Module: Inspection CLI (`aimem-inspect`)

**Version:** v0.1.0
**Date:** 2026-08-07 (Phase 9D)

## Role

`aimem-inspect` is a human-facing local utility for looking at a project's `.aimem/memory.db` directly from the terminal, without an MCP client. It is a genuinely separate program from the `aimem` MCP server — no MCP protocol involved, nothing here is exposed as a tool an AI agent can call. It exists for debugging, verifying what got captured, backup/migration export, and the corruption-recovery confirmation flow deferred from Phase 9A/9F (see [decisions/ADR.md](../decisions/ADR.md) ADR-018, ADR-020, ADR-022).

## Technology

| Component | Technology |
|---|---|
| Language | TypeScript (strict, ESM) |
| Argument parsing | Hand-rolled (`process.argv` slicing) — no new dependency; the surface is 4 subcommands and one flag |
| Storage/search access | Direct reuse of `StorageEngine`, `RetrievalEngine`, `EmbeddingEngine`, `recovery.ts` |

## File Structure

```
src/cli/
├── inspect.ts              # subcommand dispatch (main()) + pure logic (runList/runSearch/runExport/runRepair)
└── __tests__/
    └── inspect.test.ts
```

## Key Functions / Subcommands

| Subcommand | Function | Purpose |
|---|---|---|
| `aimem-inspect list` | `runList(storage)` | Lists every entity and its live (non-invalidated) observations |
| `aimem-inspect search <query>` | `runSearch(storage, embedder, query, limit)` | Runs the same hybrid keyword+vector search `memory_search` uses |
| `aimem-inspect export` | `runExport(storage)` | Dumps the full entity/observation graph, including invalidated observations, for backup/migration |
| `aimem-inspect repair [--yes]` | `runRepair(dbPath, confirmed)` | Diagnoses corruption-recovery readiness; only restores from `.bak` when `--yes` is passed |

The pure logic functions (`runList`/`runSearch`/`runExport`/`runRepair`) take an already-constructed `StorageEngine` (or, for `repair`, a raw `dbPath`) and return plain data — no `process.exit`, no stdout writes. `main()` is a thin wrapper: parses `process.argv`, resolves the project root via the same `resolveProjectRoot()` the MCP server uses, constructs dependencies, calls the relevant pure function, and prints/exits. This split makes the logic testable via direct function calls against a real temp `StorageEngine`, the same pattern every other module's tests use — no subprocess spawn needed (unlike `server.e2e.test.ts`, which must spawn a real process because `server.ts` speaks MCP over stdio).

## Lifecycle

1. **Invocation** — run directly by a human in a terminal, `cwd`'d into the project directory (or any subdirectory of it — `resolveProjectRoot()` resolves the same way the MCP server does).
2. **`list`/`search`/`export`** — if `.aimem/memory.db` doesn't exist yet, prints a plain "no memory found" message and exits 0 (no error, matching the MCP server's own fresh-start behavior — see FR-STORE-03). If it exists but fails its integrity check, prints a pointer to `repair` and exits 1, without ever constructing a `StorageEngine` that would throw.
3. **`repair`** — never opens the live `.aimem/memory.db` through `StorageEngine` at all (a corrupted file would throw); works directly against the raw path via `diagnoseCorruption()`/`recoverFromBackup()` from `recovery.ts`. Without `--yes`, reports whether a usable backup exists and stops — no write happens. With `--yes`, overwrites the current file from `.aimem/memory.db.bak`.

## Dependencies on Other Modules

- [storage-engine.md](storage-engine.md) — `StorageEngine` for `list`/`search`/`export`; `backup.ts`/`recovery.ts` for `repair`.
- [retrieval-engine.md](retrieval-engine.md) — `RetrievalEngine.search()` powers `aimem-inspect search`.
- [embedding-search-engine.md](embedding-search-engine.md) — `EmbeddingEngine` for embedding the search query.
- [mcp-server.md](mcp-server.md) — reuses `resolveProjectRoot()`; otherwise fully independent (no shared runtime state, no MCP protocol).

## Module-Specific Error Handling

- `repair` requires an explicit `--yes` flag to actually restore from backup — reporting readiness and applying the restore are two separate, deliberately non-atomic steps, since discarding the current file is a destructive, human-judgment decision (ADR-018, ADR-022).
- A missing `.aimem/memory.db` is not an error (fresh-start, matching the MCP server's own rule); a corrupted one is reported with a pointer to `repair` rather than an unhandled exception.
- `export` deliberately includes invalidated observations (via `getAllObservationsByEntity`, Phase 9D) so a backup/migration dump preserves full history; `list` deliberately does not, matching what an AI client currently sees via `memory_search`/`memory_get_project_context`.

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| Project root | CWD at invocation | Same resolution as the MCP server; not separately configurable |
| `search` result limit | 10 | Not currently exposed as a CLI flag in v1 |

See also: [../decisions/ADR.md](../decisions/ADR.md) ADR-018, ADR-020, ADR-022, [../knowledge/setup/usage-guide.md](../knowledge/setup/usage-guide.md).
