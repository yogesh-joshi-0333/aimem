# Module: MCP Server

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The MCP Server module is aimem's entry point and protocol boundary: it starts the stdio transport using the official `@modelcontextprotocol/sdk`, registers the full tool surface described in [architecture/api-design.md](../architecture/api-design.md), validates every incoming tool call against its JSON schema, dispatches to the appropriate engine module (Capture, Retrieval, or Conflict & Versioning), and formats every response — success or error — in the exact structured shape defined in [knowledge/error-handling.md](../knowledge/error-handling.md), ensuring no unhandled exception ever escapes to crash the host AI client's connection.

## Technology

| Component | Technology | Version |
|---|---|---|
| Protocol SDK | `@modelcontextprotocol/sdk` | `^1.0.0` |
| Transport | stdio (stdin/stdout JSON-RPC) | N/A |
| Schema validation | JSON Schema (via SDK's built-in validation or a lightweight validator) | N/A |
| Language | TypeScript (strict, ESM) | `^5.5.0` |

## Planned File Structure

```
src/
├── server.ts                  # entry point: creates transport, starts server
├── config.ts                  # shared constants (paths, defaults)
├── logger.ts                  # structured logger used by all modules
└── mcp-server/
    ├── tool-router.ts         # list_tools + call_tool dispatch, error boundary
    ├── tool-schemas.ts        # JSON schemas for every tool, matching api-design.md
    └── __tests__/
        ├── tool-router.test.ts
        └── server.e2e.test.ts
```

## Key Functions / Tools

| Function/Tool | Purpose |
|---|---|
| `startServer(projectRoot?: string)` | Boots the stdio transport and registers all tools |
| `listTools()` | Returns the full tool list matching [api-design.md](../architecture/api-design.md) |
| `handleToolCall(name, input)` | Validates input, dispatches to the correct engine, catches all errors |
| `resolveProjectRoot()` | Determines the project directory `.aimem/` should live under |

## Lifecycle

1. **Startup** — process launched by AI client; resolves project root; registers tool schemas; begins listening on stdio. `StorageEngine` (and everything downstream of it — `EmbeddingEngine`, `CaptureEngine`, `RetrievalEngine`, `ConflictVersioningEngine`) is deliberately **not** constructed here — see the note below.
2. **Normal operation** — receives `list_tools`/`call_tool` JSON-RPC requests; routes each `call_tool` through schema validation → lazy dependency construction (first call only) → engine dispatch → structured response.
3. **Shutdown/error** — on stdin close or SIGTERM, closes the SQLite connection cleanly (WAL checkpoint) before exiting; on an unhandled error inside a handler, catches it at the tool-router boundary and returns `INTERNAL_ERROR` (or a more specific classified error, e.g. `STORAGE_CORRUPTED`) rather than exiting the process.

**Lazy dependency construction (found necessary during Phase 7):** `StorageEngine`'s constructor throws `StorageCorruptedError` synchronously if `.aimem/memory.db` exists but fails its integrity check. Constructing it eagerly at server startup meant a corrupted file crashed the entire process before the MCP connection even finished — the AI client would see a hard "Connection closed" transport error, not the documented `STORAGE_CORRUPTED` tool response. `server.ts`'s `LazyServerDependencies` defers construction until the first tool call actually needs it, so the crash-on-corruption path was eliminated: the server always starts and lists its tools regardless of storage state, and corruption is only ever discovered (and gracefully reported) inside a normal tool call's existing error-classification path.

## Dependencies on Other Modules

- [storage-engine.md](storage-engine.md) — for project-root/database resolution at startup.
- [capture-engine.md](capture-engine.md), [retrieval-engine.md](retrieval-engine.md), [conflict-versioning-engine.md](conflict-versioning-engine.md) — dispatch targets for each tool call.

## Module-Specific Error Handling

- Owns the single top-level try/catch boundary described in [knowledge/error-handling.md](../knowledge/error-handling.md) Layer 2 — every other module may throw typed errors; only this module converts them to wire-format responses.
- Rejects malformed input before it reaches any engine module (`INVALID_INPUT`).

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| Project root | CWD at launch | Overridable via launch `args` in the client's MCP config |
| Log level | `info` | Not currently exposed via env var in v1; hardcoded default |

See also: [../architecture/system-overview.md](../architecture/system-overview.md), [../architecture/api-design.md](../architecture/api-design.md).
