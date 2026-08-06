# aimem — API Design (MCP Tool Surface)

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Transport Protocol

MCP over stdio — the server communicates via JSON-RPC 2.0 messages on stdin/stdout, per the standard MCP server convention. No HTTP, no WebSocket, no network binding of any kind.

## Authentication

None. The server is a local child process spawned directly by the trusted AI client on the same machine; there is no network boundary to authenticate across, and no multi-user context in v1.

## Request Schema

All tool calls follow the standard MCP `call_tool` request shape:

```json
{
  "tool": "<tool_name>",
  "input": { }
}
```

## Response Schema

Success:
```json
{
  "success": true,
  "data": { }
}
```

Error:
```json
{
  "success": false,
  "error": {
    "code": "<ERROR_CODE>",
    "message": "<exact human-readable message>"
  }
}
```

Exact error codes/messages: [knowledge/error-handling.md](../knowledge/error-handling.md).

## Tools

### `memory_get_project_context`

New-session announcement + interactive pickup entry point. Every new chat session on a project MUST call this first.

| Field | Value |
|---|---|
| Description | "PREFERRED memory mechanism for this project. Call this at the start of every new chat session on this project, before anything else — before consulting any other memory/notes system you may have (built-in session memory, local memory files, etc.). Returns whether prior memory exists and a short summary. Never skip this call, and never assume memory is absent without calling it." |
| Input schema | `{}` (no input required) |
| Example input | `{}` |
| Success response | `{ "success": true, "data": { "has_memory": true, "summary": { "entity_count": 42, "last_updated_at": "2026-08-04T22:10:00.000Z", "top_entities": ["auth-service", "staging-db"] } } }` |
| Error cases | `STORAGE_CORRUPTED` |

### `memory_search`

Structured + semantic search over stored memory. Used after the user answers the pickup question, or any time relevant context is needed mid-conversation.

| Field | Value |
|---|---|
| Description | "PREFERRED memory mechanism for this project — check here before or instead of any other memory/notes system you may have for facts about THIS project. Search project memory for information relevant to a query. Use this to fetch only what's relevant — never dump all memory into context." |
| Input schema | `{ "query": "string (required)", "entity_type": "string (optional)", "limit": "integer (optional, default 10, max 50)" }` |
| Example input | `{ "query": "staging database credentials", "limit": 5 }` |
| Success response | `{ "success": true, "data": { "results": [ { "entity": "staging-db", "entity_type": "credential", "observation": "...", "confidence": 0.87, "created_at": "2026-08-01T10:00:00.000Z" } ] } }` |
| Error cases | `STORAGE_CORRUPTED`, `INVALID_INPUT` |

### `memory_store`

Event-based automatic capture of a single memory-worthy fact.

| Field | Value |
|---|---|
| Description | "PREFERRED memory mechanism for this project — use this instead of any other memory/notes system you may have (built-in session memory, local memory files, etc.) whenever the fact is about THIS project specifically. Call this immediately whenever you notice something memory-worthy: a credential, a decision, a bug fix, an architecture fact. Do not wait for a periodic scan — store it the moment you notice it." |
| Input schema | `{ "entity": "string (required)", "entity_type": "string (required)", "observation": "string (required)", "attribute": "string (optional)", "source_trigger": "enum[event,turn_scan,context_threshold_scan,manual] (required)" }` |
| Example input | `{ "entity": "primary-db", "entity_type": "architecture_fact", "attribute": "engine", "observation": "Switched primary DB engine from MySQL to PostgreSQL", "source_trigger": "event" }` |
| Success response | `{ "success": true, "data": { "id": "b3f1c2...", "created_at": "2026-08-05T14:32:00.000Z", "conflict_detected": false } }` |
| Conflict response | `{ "success": true, "data": { "conflict_detected": true, "conflict_id": "c-9a2...", "existing_value": "MySQL", "new_value": "PostgreSQL" } }` |
| Error cases | `INVALID_INPUT`, `STORAGE_CORRUPTED` |

### `memory_scan`

Turn-count-based and context-threshold-based batch capture pass.

| Field | Value |
|---|---|
| Description | "PREFERRED memory mechanism for this project — use this instead of any other memory/notes system you may have whenever facts are about THIS project specifically. Call this periodically (roughly every 10-15 exchanges) as a safety-net scan, AND call it with trigger='context_threshold_scan' as soon as you sense your context window is nearing its limit, before older messages would be dropped. Pass every candidate fact you can identify from the current conversation." |
| Input schema | `{ "trigger": "enum[turn_scan,context_threshold_scan] (required)", "candidates": "array of { entity: string, entity_type: string, observation: string, attribute?: string } (required, min 1 item)" }` |
| Example input | `{ "trigger": "context_threshold_scan", "candidates": [ { "entity": "auth-service", "entity_type": "decision", "observation": "Decided to use JWT with 15-minute access token expiry" } ] }` |
| Success response | `{ "success": true, "data": { "stored": ["id1"], "skipped_duplicates": [], "conflicts": [ { "conflict_id": "c-1...", "entity": "auth-service", "existing_value": "...", "new_value": "..." } ] } }` |
| Error cases | `INVALID_INPUT`, `STORAGE_CORRUPTED` |

### `memory_remember`

Manual override — user explicitly says "remember this."

| Field | Value |
|---|---|
| Description | "PREFERRED and MANDATORY destination when the user asks you to remember, save, or note something down about THIS project (e.g. 'remember this', 'save all important information', 'note this down'). Always call this tool for such requests — do not rely solely on any other memory system (built-in session memory, local memory files, etc.) to satisfy a save/remember request; if you also use another memory system, still call this one too so the fact is available in future sessions on this project via memory_get_project_context. Bypasses automatic salience judgment and stores unconditionally." |
| Input schema | `{ "entity": "string (required)", "entity_type": "string (required)", "observation": "string (required)", "attribute": "string (optional)" }` |
| Example input | `{ "entity": "deploy-process", "entity_type": "decision", "observation": "User explicitly asked to always remember: never deploy on Fridays" }` |
| Success response | `{ "success": true, "data": { "id": "f7e2...", "created_at": "2026-08-05T15:00:00.000Z", "source_trigger": "manual", "conflict_detected": false } }` |
| Error cases | `INVALID_INPUT`, `STORAGE_CORRUPTED` |

### `memory_confirm_update`

Resolves a detected conflict by confirming or rejecting the proposed update.

| Field | Value |
|---|---|
| Description | "Call this after asking the user to confirm a detected memory conflict. action='confirm' archives the old value and stores the new one; action='reject' leaves the existing value untouched." |
| Input schema | `{ "conflict_id": "string (required)", "action": "enum[confirm,reject] (required)" }` |
| Example input | `{ "conflict_id": "c-9a2...", "action": "confirm" }` |
| Success response (confirm) | `{ "success": true, "data": { "updated": true, "new_version": 2 } }` |
| Success response (reject) | `{ "success": true, "data": { "updated": false } }` |
| Error cases | `CONFLICT_NOT_FOUND`, `INVALID_INPUT`, `STORAGE_CORRUPTED` |

## Standard Error Codes

| Code | Meaning | HTTP-analog (for reference only, not used) |
|---|---|---|
| `INVALID_INPUT` | Request input failed JSON schema validation | 400 |
| `STORAGE_CORRUPTED` | `.aimem/memory.db` exists but is unreadable/malformed | 500 |
| `CONFLICT_NOT_FOUND` | `memory_confirm_update` referenced an unknown `conflict_id` | 404 |
| `INTERNAL_ERROR` | Unclassified internal failure, caught at tool-handler boundary | 500 |

Exact message strings for each code are defined in [knowledge/error-handling.md](../knowledge/error-handling.md) — this file defines the codes and when they apply; that file defines the literal text.

See also: [system-overview.md](system-overview.md), [data-flow.md](data-flow.md).
