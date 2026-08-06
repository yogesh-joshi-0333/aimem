# aimem — Product Requirements Document

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Problem Statement

AI coding assistants lose context and coherence in long chat sessions once the context window fills, forcing the user to repeatedly re-explain credentials, architecture, and prior decisions. Even very large context windows (500k–1M+ tokens) do not solve this: they still degrade reasoning quality as they fill, waste tokens resending the same project information every session, and eventually forget older information regardless of size. This is a memory *architecture* problem, not a context *size* problem.

Two concrete pain points motivate this project:

1. **Mid-conversation forgetting** — credentials or staging details shared early in a long chat become unavailable later in the very same session.
2. **Cross-session forgetting** — starting a new chat on the same project requires manually re-pasting docs and context every single time.

## Solution

A local-first, project-scoped MCP (Model Context Protocol) memory server, built in Node.js/TypeScript on the official MCP SDK, that gives any MCP-compatible AI client persistent, structured memory tied to a specific project folder. Memory is captured automatically during conversation (event-based, turn-count-based, and context-threshold-based triggers) and retrieved at the start of every new session via an interactive pickup flow. Storage is a single portable SQLite file inside the project's own `.aimem/` folder, extended with `sqlite-vec` for semantic search over a locally bundled embedding model — no external database, no Docker, no mandatory API key, no cloud dependency.

## Architecture Summary

The AI client communicates with the aimem MCP server over stdio using the standard MCP JSON-RPC protocol; the server exposes a small set of memory tools (store, search, scan, get-project-context, remember, confirm-update) backed by a per-project SQLite database in `.aimem/memory.db` that models memory as entities, relations, and observations (graph-style, conceptually borrowed from the official MCP reference memory server), augmented with a `sqlite-vec` vector index over embeddings produced by a bundled local ONNX MiniLM-class model, so that both structured lookups and semantic similarity search run entirely offline inside a single portable file with no server process beyond the MCP server itself.

## Goals

1. Eliminate the need to re-explain project architecture, credentials, and prior decisions at the start of a new chat session.
2. Eliminate mid-conversation forgetting by capturing memory-worthy information automatically as it is shared, before it falls out of the context window.
3. Keep memory fully local, portable with the project, and never transmitted off the developer's machine.
4. Require zero external infrastructure (no Docker, no DB server, no mandatory API key) so install remains simple enough for a non-technical user.
5. Preserve a trustworthy history of decisions — never silently overwrite or silently discard conflicting information.
6. Scale to thousands of memory entries per project without perceptible query performance degradation.
7. Keep memory-scan token/latency overhead small relative to the context-reuse tokens it saves.

## Non-Goals (V2 / Deferred — explicitly out of scope for v1)

| Non-goal | Reason deferred |
|---|---|
| CLI or web UI/dashboard for browsing/editing/deleting memory | Not required for the core capture/retrieval loop; v1 is MCP-tool-only |
| Multi-user / organization / team features, RBAC, audit logs | v1 is single-user (project owner) only |
| Cross-project or global/organizational memory layer | v1 is strictly project-scoped by design |
| Cloud sync / hosted backend option | Violates local-only, zero-infrastructure design constraint |
| Plugin system for alternate storage backends (Postgres, Neo4j, Qdrant, Milvus, etc.) | SQLite + sqlite-vec is sufficient at target scale; adds complexity with no v1 benefit |
| Multi-agent shared memory (multiple agents/roles sharing one project memory) | Out of scope for single-user v1 usage pattern |
| Encryption of sensitive fields (credentials) at rest | v1 trust model matches a local `.env` file: local-only + gitignore is the boundary |
| Deterministic server-side-tracked scan-reminder mechanism | Only built if real-world use proves pure AI self-triggering unreliable |

## Users

| User | Description | v1 relevance |
|---|---|---|
| Project owner (solo developer) | Primary and only v1 user; uses aimem across their own personal/professional projects | Full v1 scope targets this user exclusively |
| Open-source community (future) | Potential adopters once the project is published on GitHub | Not a v1 design constraint, except install/setup simplicity is already designed for this future audience |

## Key Features

| # | Feature | Summary |
|---|---|---|
| 1 | MCP server (Node.js/TypeScript, official SDK) | Installable globally via npm/npx, compatible with any MCP-compliant client, no client-specific hacks |
| 2 | Per-project SQLite storage | Single portable file inside `.aimem/`, local-only, gitignored |
| 3 | Entity/relation/observation schema | Structured, queryable graph-style memory model |
| 4 | Vector/semantic search (`sqlite-vec`) | Local on-device embedding model, no API key, offline, bundled at install |
| 5 | Automatic three-tier capture | Event-based, turn-count-based, context-threshold-based, AI-instruction-driven |
| 6 | Manual "remember this" override | Explicit user-forced storage tool |
| 7 | New-session announcement + pickup | Always triggered, never conditional, never silent |
| 8 | Conflict detection + versioned history | Confirm-before-update, old values archived not deleted |
| 9 | Graceful failure handling | Missing file = fresh start; corrupted file = explicit warning; WAL concurrency |
| 10 | Scale to thousands of entries | Indexed for consistent query performance at target scale |

## Success Metrics

| Timeframe | Metric |
|---|---|
| 1 month | User never has to re-explain project architecture when starting a new chat; the AI already knows prior conversation decisions |
| 3 months | Same behavior proven stable and trustworthy across multiple real projects at scale (thousands of entries), without degradation, corruption, or growing token overhead |
| Failure bar (either condition) | AI still forgets things constantly (no better than no memory system), OR the memory system consumes more tokens than it saves — either means the project has failed its core purpose regardless of technical stability |

## Constraints

- Node.js/TypeScript with the official MCP SDK — no alternative runtime or protocol implementation.
- SQLite + `sqlite-vec` only — no external database server of any kind.
- Local, bundled embedding model — no cloud embedding API, no first-run download.
- Memory lives inside the project's own folder (`.aimem/`) — never a global OS-level location.
- Fully offline at runtime — no network calls required for normal operation.
- Single global install command, simple enough for non-technical users.
- Plaintext storage in v1 — no encryption, relying on local-only + `.gitignore` as the trust boundary.
- Must scale to thousands of entries per project with indexed, consistent query performance.
- Capture trigger model is entirely AI-instruction-driven (no background process tailing client log files).

See also: [functional-requirements.md](functional-requirements.md), [architecture/system-overview.md](../architecture/system-overview.md), [decisions/ADR.md](../decisions/ADR.md).
