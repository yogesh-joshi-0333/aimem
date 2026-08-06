# Module: Retrieval Engine

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The Retrieval Engine backs the new-session pickup experience and general in-conversation lookup: it implements `memory_get_project_context` (a lightweight summary used to announce that memory exists, without dumping full contents) and `memory_search` (a combined structured-filter + semantic-similarity query used to fetch only what's relevant to the user's stated interest), ensuring the AI never silently stays quiet about existing memory and never floods context with everything at once.

## Technology

| Component | Technology |
|---|---|
| Language | TypeScript |
| Structured filtering | SQL queries via [storage-engine.md](storage-engine.md) |
| Semantic ranking | via [embedding-search-engine.md](embedding-search-engine.md) |

## Planned File Structure

```
src/retrieval-engine/
├── retrieval-engine.ts        # getProjectContext(), search()
├── summary-builder.ts         # builds the project-context summary payload
├── types.ts                   # ProjectContextSummary, SearchResult
└── __tests__/
    ├── retrieval-engine.test.ts
    └── summary-builder.test.ts
```

## Key Functions / Tools

| Function/Tool | Purpose |
|---|---|
| `memory_get_project_context()` | Returns `has_memory` boolean + lightweight summary (entity count, last updated, top entities) |
| `memory_search(input)` | Returns ranked results combining `entity_type` filter and vector similarity to `query` |
| `buildSummary()` | Computes the aggregate stats used by `memory_get_project_context` |

## Lifecycle

1. **Startup** — stateless; depends only on Storage and Embedding modules being ready.
2. **Normal operation** — `memory_get_project_context` runs a cheap aggregate query (counts, max timestamp, top-N entity names) deliberately kept lightweight so it is safe to call on every single new session with negligible overhead; `memory_search` runs the heavier embedding + similarity path only when the user has actually asked for something specific.
3. **Shutdown/error** — no persistent state.

## Dependencies on Other Modules

- [storage-engine.md](storage-engine.md) — summary aggregates and structured filtering.
- [embedding-search-engine.md](embedding-search-engine.md) — semantic ranking for `memory_search`.

## Module-Specific Error Handling

- On a corrupted database, both tools return `STORAGE_CORRUPTED` per [error-handling.md](../knowledge/error-handling.md) — retrieval must fail loudly rather than silently reporting "no memory" when memory actually exists but is unreadable.
- On a missing database (fresh project), `memory_get_project_context` returns `{ has_memory: false }` with no error, consistent with the fresh-start rule.

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| `memory_search` default `limit` | 10 | Max 50 per call |
| Summary "top entities" count | 5 | Not currently configurable in v1 |

See also: [../architecture/data-flow.md](../architecture/data-flow.md) (sequence 1), [../workflows/developer-new-session-flow.md](../workflows/developer-new-session-flow.md).
