# aimem — Functional Requirements

**Version:** v0.1.0-planning
**Date:** 2026-08-05

Each requirement is a single testable sentence, numbered `FR-<COMPONENT>-<NUM>`. See [PRD.md](PRD.md) for the goals these implement and [architecture/api-design.md](../architecture/api-design.md) for the tool schemas that satisfy them.

## MCP Server (FR-MCP)

| ID | Requirement |
|---|---|
| FR-MCP-01 | The server MUST implement the MCP protocol over stdio transport using `@modelcontextprotocol/sdk`, with no client-specific behavior branches. |
| FR-MCP-02 | The server MUST be installable and runnable via a single `npx aimem-mcp` or `npm i -g aimem-mcp` command without additional manual configuration steps. |
| FR-MCP-03 | The server MUST register exactly the tool set defined in [architecture/api-design.md](../architecture/api-design.md) at startup and respond to an MCP `list_tools` request with that set. |
| FR-MCP-04 | The server MUST resolve the current project root as the working directory it was launched from (or an explicit configured path), and locate `.aimem/` relative to it. |
| FR-MCP-05 | The server MUST function identically when invoked from Claude Code, Cursor, Windsurf, Claude Desktop, Gemini CLI, or Codex, with no code path conditional on client identity. |

## Storage Engine (FR-STORE)

| ID | Requirement |
|---|---|
| FR-STORE-01 | The server MUST persist all memory data in a single SQLite file at `<project_root>/.aimem/memory.db`. |
| FR-STORE-02 | The server MUST open the SQLite connection in WAL (Write-Ahead Logging) journal mode on every startup. |
| FR-STORE-03 | The server MUST create `.aimem/` and `memory.db` automatically on first write if they do not already exist, without requiring a separate init command. |
| FR-STORE-04 | The server MUST model memory using three tables at minimum: `entities`, `relations`, `observations`, matching the schema in [architecture/system-overview.md](../architecture/system-overview.md). |
| FR-STORE-05 | The server MUST index the `entities.entity_type` and `observations.entity_id` columns to support consistent query latency as entry count scales into the thousands. |
| FR-STORE-06 | The server MUST append a `.gitignore` entry for `.aimem/` in the project root during first-run initialization if one does not already exist. |
| FR-STORE-07 | A query against a database containing 5,000 observation rows MUST return results in under 200ms on commodity developer hardware (measured in Phase 7/8 testing). |

## Embedding / Vector Search (FR-EMBED)

| ID | Requirement |
|---|---|
| FR-EMBED-01 | The server MUST generate embeddings using a locally bundled MiniLM-class ONNX model with no network call at runtime. |
| FR-EMBED-02 | The embedding model files MUST be bundled at install time (included in the npm package or downloaded during `npm install`'s postinstall step), never downloaded on first tool use. |
| FR-EMBED-03 | The server MUST store embeddings in a `sqlite-vec` virtual table within the same `memory.db` file, with no separate vector database process. |
| FR-EMBED-04 | The `memory_search` tool MUST support semantic (vector similarity) search over stored observations and return results ranked by similarity score. |
| FR-EMBED-05 | Semantic search MUST function with the network disconnected, verified by an integration test run with outbound network access disabled. |

## Automatic Capture (FR-CAPTURE)

| ID | Requirement |
|---|---|
| FR-CAPTURE-01 | The system MUST support event-based capture, where the AI client calls `memory_store` immediately upon recognizing memory-worthy content, per its system-prompt instructions. |
| FR-CAPTURE-02 | The system MUST support turn-count-based capture, where the AI client's instructions direct it to call `memory_scan` at least once every N conversation turns (N configurable, default provided in tool description). |
| FR-CAPTURE-03 | The system MUST support context-threshold-based capture, where the AI client's instructions direct it to call `memory_scan` with a "final scan" flag when it senses its own context window nearing capacity. |
| FR-CAPTURE-04 | The `memory_store` and `memory_scan` tool descriptions MUST explicitly instruct the AI on when to call them, since capture reliability depends entirely on instruction-following rather than external monitoring. |
| FR-CAPTURE-05 | Each captured memory write MUST record a `source_trigger` field with one of the exact values `"event"`, `"turn_scan"`, `"context_threshold_scan"`, or `"manual"`. |

## Manual Override (FR-MANUAL)

| ID | Requirement |
|---|---|
| FR-MANUAL-01 | The system MUST provide a `memory_remember` tool that stores the given content unconditionally, bypassing any automatic salience judgment. |
| FR-MANUAL-02 | A `memory_remember` call MUST set `source_trigger` to exactly `"manual"`. |

## Retrieval / New-Session Pickup (FR-RETRIEVE)

| ID | Requirement |
|---|---|
| FR-RETRIEVE-01 | The AI client, per its instructions, MUST call `memory_get_project_context` at the start of every new chat session on a project with an existing `.aimem/memory.db`, with no conditional skip logic. |
| FR-RETRIEVE-02 | `memory_get_project_context` MUST return a summary sufficient for the AI to announce that project memory exists, without returning the full memory contents in that same call. |
| FR-RETRIEVE-03 | The system MUST provide a `memory_search` tool that returns only memory relevant to a given query, never the entire memory store in one response. |
| FR-RETRIEVE-04 | The AI, per its instructions, MUST ask the user where to pick up or what they want to know before fetching detailed memory, rather than silently dumping all memory into context. |

## Conflict Detection & Versioning (FR-CONFLICT)

| ID | Requirement |
|---|---|
| FR-CONFLICT-01 | The system MUST detect when new information contradicts an existing stored value for the same entity/attribute (e.g. a database engine value changing from `"MySQL"` to `"PostgreSQL"`). |
| FR-CONFLICT-02 | On detecting a conflict, the system MUST return a structured response requiring explicit user confirmation before the stored value is updated, via `memory_confirm_update`. |
| FR-CONFLICT-03 | The system MUST NOT overwrite a conflicting value until `memory_confirm_update` is called with the corresponding conflict ID and an explicit confirm action. |
| FR-CONFLICT-04 | On a confirmed update, the system MUST archive the prior value as a new row in a version history table rather than deleting it. |
| FR-CONFLICT-05 | Each version history row MUST record `version` (incrementing integer starting at 1), `value`, `superseded_at`, and `superseded_by_version`. |

## Security (FR-SEC)

| ID | Requirement |
|---|---|
| FR-SEC-01 | The server MUST NOT open any network listener or make any outbound network call during normal operation. |
| FR-SEC-02 | The server MUST NOT log memory content (including credentials) at any log level, including debug. |
| FR-SEC-03 | The `.aimem/` directory MUST be excluded from version control via an automatically added `.gitignore` entry (see FR-STORE-06). |
| FR-SEC-04 | The server MUST validate all MCP tool input against its declared JSON schema and reject malformed input with a structured error rather than executing it. |
| FR-SEC-05 | The server MUST set file permissions on `.aimem/memory.db` restricting access to the owning user only (mode `0600` for the file, `0700` for the directory) on POSIX systems. |

## Error Handling (FR-ERR)

| ID | Requirement |
|---|---|
| FR-ERR-01 | If `.aimem/memory.db` does not exist, the server MUST silently initialize a fresh empty database with no warning or error surfaced to the user. |
| FR-ERR-02 | If `.aimem/memory.db` exists but is corrupted (unreadable or fails an integrity check), the server MUST return the exact corrupted-file error defined in [knowledge/error-handling.md](../knowledge/error-handling.md) and MUST NOT silently discard or overwrite it. |
| FR-ERR-03 | The server MUST catch all errors at the tool-handler boundary and return a structured JSON error response; it MUST NOT allow an unhandled exception to crash the server process. |
| FR-ERR-04 | Error responses MUST NOT include stack traces or internal file-system paths beyond the project-relative `.aimem/` path. |
| FR-ERR-05 | The server MUST support two or more concurrent MCP client connections to the same project's `memory.db` without data corruption, relying solely on SQLite WAL-mode locking. |

See also: [PRD.md](PRD.md), [architecture/api-design.md](../architecture/api-design.md), [knowledge/error-handling.md](../knowledge/error-handling.md), [knowledge/security-standards.md](../knowledge/security-standards.md).
