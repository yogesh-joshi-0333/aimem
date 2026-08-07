# Module: Retrieval Engine

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The Retrieval Engine backs the new-session pickup experience and general in-conversation lookup: it implements `memory_get_project_context` (a lightweight summary used to announce that memory exists, without dumping full contents) and `memory_search` (a combined structured-filter + hybrid keyword/semantic query used to fetch only what's relevant to the user's stated interest), ensuring the AI never silently stays quiet about existing memory and never floods context with everything at once.

## Technology

| Component | Technology |
|---|---|
| Language | TypeScript |
| Structured filtering | SQL queries via [storage-engine.md](storage-engine.md) |
| Ranking | Hybrid vector + keyword search via [embedding-search-engine.md](embedding-search-engine.md) (Phase 9E, see below) |

## Ranking: Hybrid Search (Phase 9E)

`memory_search` ranks results using **Reciprocal Rank Fusion (RRF)** over two independent searches, not vector similarity alone:

1. **Vector similarity** (`sqlite-vec` distance) — semantic closeness to the query, via the bundled local embedding model.
2. **Keyword search** (SQLite FTS5 over `observations.observation`) — exact/near-exact term matches, catching identifiers (credential names, env vars, literal strings) that a pure embedding comparison sometimes ranks lower than a semantically-similar-but-different fact.

Each search independently returns up to `HYBRID_CANDIDATE_POOL_SIZE` (20) candidates; RRF combines them by **rank position**, not raw score — `sqlite-vec`'s distance and FTS5's bm25-based `rank` are not on a comparable scale (verified empirically: FTS5's `rank` is an unbounded small-negative number whose magnitude depends on corpus statistics), so position-based fusion sidesteps that mismatch rather than trying to weight two incompatible units together. A result ranking well in *either* list scores highly; a result ranking well in *both* scores higher than either alone. See `src/embedding-search-engine/hybrid-search.ts`.

Measured impact against the Phase 9B benchmark's known misses: 2 of 5 previously-rank-2 results moved to rank 1 under hybrid search; 3 stayed at rank 2 — a real, partial improvement, not a complete fix. See [decisions/ADR.md](../decisions/ADR.md) ADR-019 for the exact before/after per query.

## Planned File Structure

```
src/retrieval-engine/
├── retrieval-engine.ts        # getProjectContext(), search() -- search() calls
│                               #   searchHybridObservations (embedding-search-engine)
├── types.ts                   # ProjectContextSummary, SearchResult
└── __tests__/
    └── retrieval-engine.test.ts

src/embedding-search-engine/
├── vector-index.ts            # sqlite-vec similarity search
├── keyword-search.ts          # FTS5 keyword search (Phase 9E)
├── hybrid-search.ts           # Reciprocal Rank Fusion of the above (Phase 9E)
└── __tests__/
    └── hybrid-search.integration.test.ts
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
