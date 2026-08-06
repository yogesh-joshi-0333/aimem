# aimem — System Overview

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Full Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          Developer's Local Machine                        │
│                                                                             │
│  ┌───────────────────────┐                                                │
│  │   AI Client Process    │                                                │
│  │  (Claude Code, Cursor, │                                                │
│  │   Windsurf, Claude     │                                                │
│  │   Desktop, Gemini CLI, │                                                │
│  │   Codex, ...)          │                                                │
│  └───────────┬────────────┘                                                │
│              │  MCP protocol (JSON-RPC 2.0 over stdio)                     │
│              │  spawns aimem as a child process                           │
│              ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     aimem MCP Server (Node.js/TS)                    │  │
│  │                                                                       │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐               │  │
│  │  │ Tool Router  │→│ Capture Engine│  │ Retrieval     │               │  │
│  │  │ (list_tools, │  │ (store/scan/  │  │ Engine        │               │  │
│  │  │  call_tool)  │  │  remember)    │  │ (get_context/ │               │  │
│  │  └──────┬───────┘  └──────┬───────┘  │  search)      │               │  │
│  │         │                 │           └──────┬────────┘               │  │
│  │         │          ┌──────▼────────┐          │                        │  │
│  │         │          │ Conflict &    │          │                        │  │
│  │         │          │ Versioning    │          │                        │  │
│  │         │          │ Engine        │          │                        │  │
│  │         │          └──────┬────────┘          │                        │  │
│  │         │                 │                    │                        │  │
│  │         └─────────┬───────┴────────────────────┘                       │  │
│  │                   ▼                                                    │  │
│  │         ┌─────────────────────┐        ┌──────────────────────┐       │  │
│  │         │  Storage Engine      │◄──────►│ Embedding/Search      │       │  │
│  │         │  (better-sqlite3)    │        │ Engine (transformers.js│      │  │
│  │         └──────────┬───────────┘        │ + sqlite-vec)          │      │  │
│  │                    │                     └───────────┬────────────┘      │  │
│  └────────────────────┼─────────────────────────────────┼───────────────┘  │
│                       ▼                                 ▼                  │
│         ┌───────────────────────────────────────────────────────┐          │
│         │        <project_root>/.aimem/                          │          │
│         │  ┌─────────────────────────────────────────────────┐  │          │
│         │  │ memory.db  (SQLite, WAL mode)                    │  │          │
│         │  │  tables: entities, relations, observations,       │  │          │
│         │  │          observation_versions, conflicts          │  │          │
│         │  │  virtual table: vec_observations (sqlite-vec)     │  │          │
│         │  └─────────────────────────────────────────────────┘  │          │
│         │  bundled model files (ONNX MiniLM, installed once)     │          │
│         └───────────────────────────────────────────────────────┘          │
│                                                                             │
│      Everything below the AI Client box is 100% local.                    │
│      Nothing in this diagram ever leaves the machine in v1.               │
└───────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Module doc |
|---|---|---|
| Tool Router | Registers MCP tools, validates input schemas, dispatches `call_tool` requests, formats responses | [modules/mcp-server.md](../modules/mcp-server.md) |
| Capture Engine | Implements `memory_store`, `memory_scan`, `memory_remember`; applies salience/dedup judgment for automatic captures | [modules/capture-engine.md](../modules/capture-engine.md) |
| Retrieval Engine | Implements `memory_get_project_context`, `memory_search`; assembles pickup summaries and query results | [modules/retrieval-engine.md](../modules/retrieval-engine.md) |
| Conflict & Versioning Engine | Detects contradictions against existing values, manages `memory_confirm_update`, writes version history | [modules/conflict-versioning-engine.md](../modules/conflict-versioning-engine.md) |
| Storage Engine | Owns the SQLite connection, schema migrations, WAL mode, CRUD for entities/relations/observations | [modules/storage-engine.md](../modules/storage-engine.md) |
| Embedding/Search Engine | Loads the bundled ONNX model, generates embeddings, manages the `sqlite-vec` virtual table, runs similarity queries | [modules/embedding-search-engine.md](../modules/embedding-search-engine.md) |

## Request/Response Flow Walkthrough — Storing a Memory During Conversation

1. During conversation, the AI recognizes memory-worthy content (e.g. "we're switching the database from MySQL to PostgreSQL").
2. Per its tool-description instructions, the AI calls the `memory_store` tool over the existing stdio MCP connection, with a JSON-RPC `call_tool` request containing `entity`, `entity_type`, `observation`, and `source_trigger: "event"`.
3. The Tool Router validates the input JSON against the `memory_store` schema (see [api-design.md](api-design.md)). Invalid input short-circuits to a structured error response.
4. The Capture Engine looks up whether an entity with this name/type already exists in the `entities` table via the Storage Engine.
5. If the entity exists and a conflicting prior observation is found for the same attribute, the Capture Engine hands off to the Conflict & Versioning Engine, which returns a `conflict_detected` response instead of writing — see [data-flow.md](data-flow.md) for this branch.
6. If no conflict, the Embedding/Search Engine generates a vector embedding for the observation text using the bundled local model.
7. The Storage Engine writes the new row to `observations` (and the corresponding vector to `vec_observations`) inside a single SQLite transaction.
8. The Tool Router returns a success response containing the new observation's `id` and `created_at` to the AI client.
9. The AI continues the conversation without interrupting the user — the store call is a background action, not a visible turn.

## Security Boundary Diagram

```
┌─────────────────────────── Local machine boundary ───────────────────────────┐
│                                                                                │
│   AI client  ──stdio──►  aimem server  ──file I/O──►  .aimem/memory.db        │
│                              │                                                │
│                              └──local model load──►  bundled ONNX model files │
│                                                                                │
│   No component above opens a network socket. No data crosses this boundary.  │
└────────────────────────────────────────────────────────────────────────────────┘
                                      ✕
                    Nothing crosses to the internet in v1.
                    (No API calls, no telemetry, no cloud sync, no update
                     check that transmits project data.)
```

## Technology Stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| Language | TypeScript | `^5.5.0` | Static typing for a protocol/schema-heavy server |
| Runtime | Node.js | `>=20.11.0 <21` | LTS, native ESM, wide MCP client compatibility |
| Protocol | MCP (`@modelcontextprotocol/sdk`) | `^1.0.0` | Standard protocol, works with any compliant client |
| Storage | SQLite (`better-sqlite3`) | `^11.0.0` | Single-file, zero-server, WAL concurrency built in |
| Vector index | `sqlite-vec` | `^0.1.6` | Embedded vector search, same file, no separate DB |
| Embeddings | `@xenova/transformers` (MiniLM-class) | `^2.17.0` | Local ONNX inference, no API key, offline |
| Packaging | npm | `>=10.0.0` | Universal, supports `npx` zero-install runs |

See also: [data-flow.md](data-flow.md), [api-design.md](api-design.md), [decisions/ADR.md](../decisions/ADR.md).
