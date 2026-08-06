# aimem — Data Flow

**Version:** v0.1.0-planning
**Date:** 2026-08-05

Sequence diagrams for every major operation. See [system-overview.md](system-overview.md) for component definitions and [api-design.md](api-design.md) for exact schemas.

## 1. New-Session Pickup

```
AI Client                aimem Server              Storage Engine
    │                         │                          │
    │  call_tool:              │                          │
    │  memory_get_project_     │                          │
    │  context                 │                          │
    │─────────────────────────►│                          │
    │                         │  SELECT summary stats     │
    │                         │  (entity counts, last     │
    │                         │   updated_at, top topics) │
    │                         │─────────────────────────►│
    │                         │◄─────────────────────────│
    │  { has_memory: true,     │                          │
    │    summary: {...} }      │                          │
    │◄─────────────────────────│                          │
    │                         │                          │
    │  [AI announces memory   │                          │
    │   exists, asks user     │                          │
    │   where to pick up]     │                          │
    │                         │                          │
    │  call_tool:              │                          │
    │  memory_search           │                          │
    │  { query: "<user's       │                          │
    │    answer>" }            │                          │
    │─────────────────────────►│                          │
    │                         │  embed(query) + vector    │
    │                         │  + structured search      │
    │                         │─────────────────────────►│
    │                         │◄─────────────────────────│
    │  { results: [...] }      │                          │
    │◄─────────────────────────│                          │
```

Data format at each step:
- Request 1: `{ "tool": "memory_get_project_context", "input": {} }`
- Response 1: `{ "has_memory": true, "summary": { "entity_count": 42, "last_updated_at": "2026-08-04T22:10:00.000Z", "top_entities": ["auth-service", "staging-db"] } }`
- Request 2: `{ "tool": "memory_search", "input": { "query": "staging database credentials", "limit": 5 } }`
- Response 2: `{ "results": [ { "entity": "staging-db", "observation": "...", "confidence": 0.87, "created_at": "..." } ] }`

## 2. Event-Based Capture

```
AI Client                aimem Server              Embed Engine        Storage Engine
    │                         │                         │                    │
    │ [notices memory-worthy   │                         │                    │
    │  fact mid-conversation]  │                         │                    │
    │                         │                         │                    │
    │ call_tool: memory_store  │                         │                    │
    │─────────────────────────►│                         │                    │
    │                         │ lookup existing entity   │                    │
    │                         │─────────────────────────────────────────────►│
    │                         │◄─────────────────────────────────────────────│
    │                         │  [no conflict found]     │                    │
    │                         │ embed(observation text)  │                    │
    │                         │─────────────────────────►│                    │
    │                         │◄─────────────────────────│                    │
    │                         │ INSERT entity/observation │                    │
    │                         │ + vector, in 1 txn        │                    │
    │                         │─────────────────────────────────────────────►│
    │                         │◄─────────────────────────────────────────────│
    │ { id, created_at }        │                         │                    │
    │◄─────────────────────────│                         │                    │
```

Data format: request `{ "tool": "memory_store", "input": { "entity": "staging-db", "entity_type": "credential", "observation": "staging DB password rotated to use env var STAGING_DB_PASS", "source_trigger": "event" } }`; response `{ "id": "b3f1...", "created_at": "2026-08-05T14:32:00.000Z", "conflict_detected": false }`.

## 3. Context-Nearing-Full Final Scan

```
AI Client                        aimem Server                 Storage Engine
    │                                 │                              │
    │ [self-senses context window     │                              │
    │  approaching limit]             │                              │
    │                                 │                              │
    │ call_tool: memory_scan           │                              │
    │ { trigger: "context_threshold",  │                              │
    │   candidates: [ {..}, {..} ] }   │                              │
    │────────────────────────────────►│                              │
    │                                 │ for each candidate:           │
    │                                 │   dedup check + conflict check │
    │                                 │──────────────────────────────►│
    │                                 │◄──────────────────────────────│
    │                                 │ batch INSERT non-conflicting   │
    │                                 │──────────────────────────────►│
    │                                 │◄──────────────────────────────│
    │ { stored: [...], skipped_dupes:  │                              │
    │   [...], conflicts: [...] }      │                              │
    │◄────────────────────────────────│                              │
    │                                 │                              │
    │ [if conflicts non-empty, AI      │                              │
    │  asks user to confirm before     │                              │
    │  context is dropped]             │                              │
```

This is the trigger that most directly addresses the original mid-conversation-forgetting problem: it runs as a last-chance save *before* older messages are evicted from the context window.

## 4. Conflict Detection & Confirmation

```
AI Client                        aimem Server                 Storage Engine
    │                                 │                              │
    │ call_tool: memory_store           │                              │
    │ { entity: "primary-db",           │                              │
    │   observation: "engine=PostgreSQL"}│                             │
    │────────────────────────────────►│                              │
    │                                 │ lookup existing observation    │
    │                                 │ for entity="primary-db",       │
    │                                 │ attribute="engine"             │
    │                                 │──────────────────────────────►│
    │                                 │◄──────────────────────────────│
    │                                 │ [existing value = "MySQL",     │
    │                                 │  new value = "PostgreSQL" →    │
    │                                 │  CONFLICT]                     │
    │ { conflict_detected: true,        │                              │
    │   conflict_id: "c-9a2...",        │                              │
    │   existing_value: "MySQL",        │                              │
    │   new_value: "PostgreSQL" }       │                              │
    │◄────────────────────────────────│                              │
    │                                 │                              │
    │ [AI asks user to confirm]         │                              │
    │                                 │                              │
    │ call_tool: memory_confirm_update  │                              │
    │ { conflict_id: "c-9a2...",         │                              │
    │   action: "confirm" }              │                              │
    │────────────────────────────────►│                              │
    │                                 │ INSERT observation_versions    │
    │                                 │ (archive old value, version+1) │
    │                                 │ UPDATE observations (new value)│
    │                                 │──────────────────────────────►│
    │                                 │◄──────────────────────────────│
    │ { updated: true, new_version: 2 } │                              │
    │◄────────────────────────────────│                              │
```

If `action: "reject"` is sent instead, the server leaves the existing value untouched and returns `{ "updated": false }`.

## Error Flow Diagram

```
AI Client                        aimem Server
    │                                 │
    │ any call_tool request            │
    │────────────────────────────────►│
    │                                 │ try { handle } catch (err) {
    │                                 │   classify error
    │                                 │   log (no PII/content)
    │                                 │   return structured error
    │                                 │ }
    │ { error: { code: "...",           │
    │   message: "<exact string>" } }   │
    │◄────────────────────────────────│
```

No exception ever propagates past the tool-handler boundary uncaught. See [knowledge/error-handling.md](../knowledge/error-handling.md) for exact codes/messages.

## Connection Lifecycle

```
STARTUP
  │
  ▼
Resolve project root ──► Open/create .aimem/memory.db ──► Set PRAGMA journal_mode=WAL
  │                                                              │
  ▼                                                              ▼
Load bundled embedding model (lazy, on first embed call)   Run pending migrations
  │                                                              │
  └──────────────────────────┬───────────────────────────────────┘
                              ▼
                        NORMAL USE
                  (serve call_tool/list_tools requests
                   over stdio until client disconnects)
                              │
                              ▼
                     DISCONNECT / SHUTDOWN
                  stdin closed by client, or SIGTERM
                              │
                              ▼
                  Close SQLite connection cleanly (WAL checkpoint)
                              │
                              ▼
                            EXIT

RECONNECT: a new AI client process spawns a fresh aimem server process;
no server-side session state persists between processes except what is
in memory.db itself. Two server processes may hold the same memory.db
open concurrently — WAL mode makes this safe (see FR-ERR-05).
```

See also: [system-overview.md](system-overview.md), [api-design.md](api-design.md).
