# Module: Conflict & Versioning Engine

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The Conflict & Versioning Engine protects the integrity of stored memory by detecting when an incoming observation contradicts an existing value for the same entity/attribute, halting the write and returning a structured conflict for user confirmation via `memory_confirm_update`, and — only upon explicit confirmation — archiving the superseded value into a version history table rather than deleting it, so the project's decision history ("remember WHY, not just WHAT") is preserved rather than silently lost.

## Technology

| Component | Technology |
|---|---|
| Language | TypeScript |
| Comparison logic | Exact/normalized value comparison against latest observation for a given entity+attribute |
| Persistence | `observation_versions` and `conflicts` tables via [storage-engine.md](storage-engine.md) |

## Planned File Structure

```
src/conflict-versioning-engine/
├── conflict-versioning-engine.ts   # detectConflict(), confirmUpdate()
├── types.ts                        # Conflict, VersionRecord
└── __tests__/
    └── conflict-versioning-engine.test.ts
```

## Key Functions / Tools

| Function/Tool | Purpose |
|---|---|
| `detectConflict(entityId, attribute, newValue)` | Compares against the latest stored value; returns a `Conflict` record or `null` |
| `memory_confirm_update(input)` | Resolves a pending conflict by `conflict_id`: `confirm` archives + updates, `reject` leaves untouched |
| `archiveAndUpdate(observationId, oldValue, newValue)` | Writes the old value to `observation_versions`, increments `version`, updates the live row |

## Lifecycle

1. **Startup** — stateless; depends on Storage module.
2. **Normal operation** — invoked by the Capture Engine before every write; if no conflict, the Capture Engine proceeds directly to storage; if a conflict is found, a row is inserted into `conflicts` with `status: "pending"` and returned to the caller — the underlying value is NOT changed until `memory_confirm_update` is called.
3. **Shutdown/error** — pending conflicts persist in the `conflicts` table across server restarts (they are just rows in `memory.db`), so an unresolved conflict is not lost if the session ends before confirmation.

## Dependencies on Other Modules

- [storage-engine.md](storage-engine.md) — all conflict/version persistence.
- Consumed by [capture-engine.md](capture-engine.md) (pre-write check) and the MCP Server module (routes `memory_confirm_update` calls here).

## Module-Specific Error Handling

- `memory_confirm_update` with an unknown `conflict_id` returns `CONFLICT_NOT_FOUND` (see [error-handling.md](../knowledge/error-handling.md)) — never silently no-ops.
- A `reject` action is a valid, successful outcome (`updated: false`), not an error.
- Archive-then-update on confirm happens inside a single transaction — a crash mid-operation must never leave the version history and the live value inconsistent.

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| Conflict comparison strictness | Exact/normalized string match on the attribute's value | Not configurable in v1; semantic-similarity-based conflict detection is a possible future refinement, not v1 scope |

See also: [../architecture/data-flow.md](../architecture/data-flow.md) (sequence 4), [../workflows/conflict-resolution-flow.md](../workflows/conflict-resolution-flow.md), [../decisions/ADR.md](../decisions/ADR.md) (ADR-006).
