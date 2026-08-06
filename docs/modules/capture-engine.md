# Module: Capture Engine

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The Capture Engine implements the three-tier automatic memory capture model: it backs the `memory_store` tool (event-based, immediate single-fact capture), the `memory_scan` tool (turn-count-based and context-threshold-based batch capture passes), and the `memory_remember` tool (manual override), applying deduplication against existing memory and routing anything that contradicts a stored value to the Conflict & Versioning Engine before ever writing through the Storage Engine.

## Technology

| Component | Technology |
|---|---|
| Language | TypeScript |
| Dedup comparison | String similarity / exact-match check against existing observations for the same entity+attribute |
| Persistence | via [storage-engine.md](storage-engine.md) |
| Embeddings | via [embedding-search-engine.md](embedding-search-engine.md) |

## Planned File Structure

```
src/capture-engine/
├── capture-engine.ts          # store(), scan(), remember() implementations
├── dedup.ts                   # duplicate-detection helper
├── types.ts                   # CaptureCandidate, CaptureResult
└── __tests__/
    ├── capture-engine.test.ts
    └── dedup.test.ts
```

## Key Functions / Tools

| Function/Tool | Purpose |
|---|---|
| `memory_store(input)` | Event-based single-fact capture; checks conflict → embeds → writes |
| `memory_scan(input)` | Batch capture for turn-count/context-threshold triggers; per-candidate dedup + conflict check |
| `memory_remember(input)` | Manual override; unconditional write with `source_trigger: "manual"` |
| `isDuplicate(candidate, existingObservations)` | Skips storing near-identical existing facts |

## Lifecycle

1. **Startup** — stateless; no special initialization beyond its dependencies (Storage, Embedding) being ready.
2. **Normal operation** — invoked per tool call from the MCP Server module; for each candidate: dedup check → conflict check (delegates to [conflict-versioning-engine.md](conflict-versioning-engine.md)) → embed → write, all inside one logical operation per candidate.
3. **Shutdown/error** — no persistent state held between calls; any failure mid-batch (in `memory_scan`) still commits the candidates that succeeded before the failure, and reports per-candidate outcomes rather than failing the entire batch atomically — a single bad candidate must not block the rest of a final context-threshold scan.

## Dependencies on Other Modules

- [storage-engine.md](storage-engine.md) — persistence of entities/observations.
- [embedding-search-engine.md](embedding-search-engine.md) — embedding generation for new observations.
- [conflict-versioning-engine.md](conflict-versioning-engine.md) — conflict detection before write.

## Module-Specific Error Handling

- A conflict is not an error — it is a structured `conflict_detected: true` success response (see [architecture/api-design.md](../architecture/api-design.md)).
- `memory_scan` with an empty `candidates` array returns `INVALID_INPUT` (nothing to scan is a caller mistake, not a valid no-op).
- Per-candidate failures inside a batch are reported in the response rather than thrown, so one malformed candidate does not lose the rest of a context-threshold-triggered final scan.

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| Turn-count scan interval guidance | ~10–15 exchanges | Embedded in tool description text, not enforced in code (AI-instruction-driven, per ADR-005) |
| Duplicate similarity threshold | High string/semantic similarity (exact match or near-exact) | Tunable during Phase 4 implementation |

See also: [../architecture/data-flow.md](../architecture/data-flow.md) (sequences 2 and 3), [../workflows/developer-active-session-capture-flow.md](../workflows/developer-active-session-capture-flow.md).
