# Module: Storage Engine

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Role

The Storage Engine owns the single SQLite file (`.aimem/memory.db`) that holds all of a project's memory: it manages connection lifecycle and WAL-mode configuration, runs schema migrations, provides CRUD operations for the entity/relation/observation graph-style schema plus the conflict/version-history tables, enforces indexing for scale, and is the sole module permitted to issue raw SQL — every other module reads/writes memory exclusively through this engine's typed methods.

## Technology

| Component | Technology | Version |
|---|---|---|
| Driver | `better-sqlite3` | `^11.0.0` |
| Journal mode | SQLite WAL | native |
| Schema migration | Hand-written sequential `.sql` files, applied by a small runner | N/A |

## Planned File Structure

```
src/storage-engine/
├── storage-engine.ts           # StorageEngine class: connection, CRUD, migrations
├── types.ts                    # EntityRecord, RelationRecord, ObservationRecord, etc.
├── errors.ts                   # StorageCorruptedError
├── backup.ts                   # Phase 9A: rolling .bak copy before risky writes
├── recovery.ts                 # Phase 9A: corruption diagnosis + restore-from-backup (no in-place repair, see ADR-018)
├── ensure-gitignore.ts
├── migrations/
│   ├── 001-init-schema.sql      # entities, relations, observations
│   ├── 002-conflict-versioning.sql  # observation_versions, conflicts
│   ├── 003-vector-index.sql     # observation_embeddings mapping table
│   └── 004-fts-search.sql       # observations_fts (Phase 9E, external-content FTS5 + sync triggers)
└── __tests__/
    ├── storage-engine.test.ts
    ├── concurrency.test.ts
    ├── backup.test.ts
    └── recovery.test.ts
```

## Schema (Core Tables)

| Table | Key columns |
|---|---|
| `entities` | `id` (uuid), `name`, `entity_type`, `created_at`, `updated_at` |
| `relations` | `id`, `from_entity_id`, `to_entity_id`, `relation_type`, `created_at` |
| `observations` | `id`, `entity_id`, `attribute`, `observation`, `confidence`, `source_trigger`, `version`, `created_at`, `updated_at` |
| `observation_versions` | `id`, `observation_id`, `version`, `value`, `superseded_at`, `superseded_by_version` |
| `conflicts` | `id`, `observation_id`, `existing_value`, `new_value`, `status`, `created_at`, `resolved_at` |
| `observation_embeddings` | `observation_id` (TEXT, PK), `vec_rowid` (INTEGER, UNIQUE), `created_at` — maps a UUID `observations.id` to the integer `rowid` required by `vec_observations`, since `sqlite-vec`'s `vec0` virtual table requires an integer rowid and observation IDs are UUID strings. Added during Phase 3 (migration `003-vector-index.sql`), not foreseen when this doc was first written. |
| `vec_observations` (virtual, owned jointly with Embedding module) | `rowid` (INTEGER, maps via `observation_embeddings.vec_rowid`), `embedding` |

Indexes: `entities.entity_type`, `observations.entity_id`, `observations.attribute`.

## Key Functions / Methods

| Method | Purpose |
|---|---|
| `open(dbPath)` | Opens connection, sets WAL pragma, runs integrity check, applies migrations |
| `createEntity(input)` / `getEntityByName(name)` / `listEntities(filter?)` | Entity CRUD |
| `createObservation(input)` / `getObservationsByEntity(entityId)` | Observation CRUD |
| `createRelation(input)` / `getRelationsByEntity(entityId)` | Relation CRUD |
| `findConflict(entityId, attribute, newValue)` | Compares new value against latest stored value |
| `archiveVersion(observationId, oldValue)` | Writes to `observation_versions`, increments `version` |
| `close()` | Clean WAL checkpoint + connection close |

## Lifecycle

1. **Startup** — `open()` called by the MCP Server module; creates `.aimem/` + `memory.db` if missing (silent fresh start); runs integrity check; throws `StorageCorruptedError` if it fails; applies any pending migrations.
2. **Normal operation** — serves CRUD calls from Capture, Retrieval, and Conflict & Versioning engines inside short-lived transactions.
3. **Shutdown/error** — `close()` performs a WAL checkpoint and releases the file handle; on `StorageCorruptedError`, the file is left untouched for manual inspection.

## Dependencies on Other Modules

- Consumed by [mcp-server.md](mcp-server.md), [capture-engine.md](capture-engine.md), [retrieval-engine.md](retrieval-engine.md), [conflict-versioning-engine.md](conflict-versioning-engine.md).
- Shares the `vec_observations` virtual table with [embedding-search-engine.md](embedding-search-engine.md), which owns the embedding-generation side while this module owns the row lifecycle.

## Known Timing Edge Case (found and fixed during Phase 6)

`getTopEntitiesByRecentActivity` ranks entities by `MAX(observations.updated_at)`, an ISO-8601 string with millisecond resolution. Two writes issued synchronously in the same millisecond (common in tests, and possible in a fast automated `memory_scan` batch) can tie on `updated_at`, making the ranking non-deterministic without a tiebreaker. Fixed by adding `MAX(observations.rowid)` as a secondary `ORDER BY` key — SQLite's implicit rowid increments strictly with insertion order, giving a deterministic "most recent" ranking even under same-millisecond ties.

## Module-Specific Error Handling

- Throws `StorageCorruptedError` on failed integrity check — never auto-repairs or deletes the file.
- All writes to related tables (e.g. observation + version archive) happen inside a single transaction to avoid partial writes.

## Configuration Options

| Option | Default | Notes |
|---|---|---|
| DB file path | `<project_root>/.aimem/memory.db` | Not overridable in v1 |
| File permissions | `0600` (file) / `0700` (dir) | POSIX only |
| Journal mode | `WAL` | Fixed, not configurable |

See also: [../architecture/system-overview.md](../architecture/system-overview.md), [../requirements/functional-requirements.md](../requirements/functional-requirements.md) (FR-STORE-*).
