# aimem

[![npm version](https://img.shields.io/npm/v/aimem-mcp.svg)](https://www.npmjs.com/package/aimem-mcp)
[![npm downloads](https://img.shields.io/npm/dm/aimem-mcp.svg)](https://www.npmjs.com/package/aimem-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/aimem-mcp.svg)](package.json)

**A local-first MCP (Model Context Protocol) memory server that gives Claude Code, Cursor, Windsurf, and any other MCP-compatible AI coding assistant persistent, project-scoped memory across chat sessions.**

aimem solves AI memory loss in long coding sessions: no more re-explaining your architecture, credentials, or past decisions every time you start a new chat. It's an offline, zero-API-key alternative to cloud-based AI memory services — SQLite + local vector search (`sqlite-vec`) + a bundled embedding model, stored inside each project's own `.aimem/` folder. No external database, no cloud API, no account required. Everything runs on your machine and never leaves it.

> **Status:** v0.1.1 — [published on npm as `aimem-mcp`](https://www.npmjs.com/package/aimem-mcp). Core functionality complete and tested (Phases 1–7). Cross-client validation and real-world daily use are in progress. See [docs/knowledge/setup/current-project-state.md](docs/knowledge/setup/current-project-state.md) for the exact current state.

## Why

Long AI coding sessions eventually hit the same wall: the context window fills up, older details get dropped or summarized away, and you end up re-explaining the same architecture, credentials, and decisions over and over — in the same session, and every time you start a new one. Bigger context windows push the problem back but never solve it; they still cost tokens, still degrade reasoning as they fill, and still forget eventually.

aimem treats this as a memory *architecture* problem, not a context *size* problem. Instead of cramming everything into the context window, an aimem-connected agent stores what actually matters — credentials, decisions, architecture facts, bug fixes — in a small local database, and retrieves only what's relevant, when it's relevant.

## How it works

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
│              ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     aimem MCP Server (Node.js/TS)                    │  │
│  │   Tool Router → Capture Engine → Conflict/Versioning Engine          │  │
│  │              ↘ Retrieval Engine ↗                                    │  │
│  │                    Storage Engine ←→ Embedding/Search Engine         │  │
│  └────────────────────┬────────────────────────────────────────────────┘  │
│                       ▼                                                    │
│         <project_root>/.aimem/memory.db  (SQLite + sqlite-vec, WAL mode)   │
│         local ONNX embedding model, bundled at install — no API key       │
│                                                                             │
│      Nothing above ever leaves the machine. No network calls at runtime.  │
└─────────────────────────────────────────────────────────────────────────┘
```

Memory is captured three ways, all driven by the AI's own judgment rather than a background process:

- **Event-based** — the moment the AI notices something worth remembering (a credential, a decision, a bug fix), it's stored immediately.
- **Turn-count based** — a periodic safety-net scan every ~10–15 exchanges catches anything the event trigger missed.
- **Context-threshold based** — as the AI senses its own context window filling up, it runs one last thorough save before older messages get dropped.

At the start of every new chat, the AI always checks whether memory exists for the project and asks where to pick up — it never silently stays quiet, and never dumps the entire memory store into context at once.

See [docs/architecture/system-overview.md](docs/architecture/system-overview.md) for the full component breakdown and [docs/architecture/data-flow.md](docs/architecture/data-flow.md) for sequence diagrams of every operation.

## Tools

| Tool | Purpose |
|---|---|
| `memory_get_project_context` | Called at the start of every new session — reports whether memory exists and a short summary |
| `memory_search` | Structured + semantic search over stored memory, scoped to what's relevant |
| `memory_store` | Event-based capture of a single memory-worthy fact, the moment it's noticed |
| `memory_scan` | Batch capture for periodic and context-threshold safety-net passes |
| `memory_remember` | Manual override — stores unconditionally when the user explicitly says "remember this" |
| `memory_confirm_update` | Resolves a detected conflict between new and existing memory, with full version history |

Full request/response schemas: [docs/architecture/api-design.md](docs/architecture/api-design.md).

## Design principles

- **Local-first, always.** Memory lives in `<project_root>/.aimem/memory.db` — a single portable SQLite file that moves with the project, survives renames, and is gitignored by default.
- **Zero external dependencies.** No Docker, no database server, no cloud API, no mandatory API key. The embedding model is bundled into the npm package at install time.
- **Project-scoped, not global.** Each project's memory is fully isolated. There's no cross-project or organization-wide memory in v1 — that's an explicit, deliberate scope boundary.
- **Never silently overwrite.** If new information contradicts something already stored, aimem flags the conflict and asks for confirmation before updating — old values are archived, not deleted.
- **Fail loud, never crash.** A missing memory file is a normal fresh start. A corrupted one is reported with an exact, actionable error — the server never crashes the host AI client's connection.

The full reasoning behind every major decision — including two real, non-obvious bugs found and fixed during packaging (a missing shebang, and a symlink-resolution bug that silently broke every real install path) — is recorded in [docs/decisions/ADR.md](docs/decisions/ADR.md).

## Installation

```bash
npm install -g aimem-mcp
```

**Claude Code** — register it once, available in every project from then on:

```bash
claude mcp add aimem-mcp npx aimem-mcp -s user
```

**Any other MCP client** (Cursor, Windsurf, Claude Desktop, ...) — add to your client's MCP config:

```json
{
  "mcpServers": {
    "aimem-mcp": {
      "command": "npx",
      "args": ["aimem-mcp"]
    }
  }
}
```

**If your Node.js was installed via a version manager (nvm, fnm, volta)** — MCP clients often can't find `node`/`npx` on `PATH` this way; use absolute paths instead. See [docs/knowledge/setup/install-guide.md](docs/knowledge/setup/install-guide.md#if-your-nodejs-was-installed-via-a-version-manager-nvm-fnm-volta) for the exact fix.

Full install steps, verification, and troubleshooting: [docs/knowledge/setup/install-guide.md](docs/knowledge/setup/install-guide.md). For what actually happens once it's running — how memory gets created and used day to day — see [docs/knowledge/setup/usage-guide.md](docs/knowledge/setup/usage-guide.md).

## Development

```bash
npm install       # installs dependencies and bundles the local embedding model
npm run build      # compiles TypeScript to dist/
npm test           # fast unit + integration tests
npm run test:e2e    # spawns the real compiled server over stdio
npm run lint         # ESLint
```

This project follows a strict phase-based development discipline documented in [docs/implementation/phases.md](docs/implementation/phases.md) and [docs/RULES.md](docs/RULES.md) — every change is tracked in [docs/AGENT-LOG.md](docs/AGENT-LOG.md), and every non-trivial decision has a corresponding entry in [docs/decisions/ADR.md](docs/decisions/ADR.md).

## Documentation

All project documentation lives under [`docs/`](docs/):

| Doc | Purpose |
|---|---|
| [docs/RULES.md](docs/RULES.md) | Enforceable project rules — tech stack, naming, security, testing, phase discipline |
| [docs/AGENT-LOG.md](docs/AGENT-LOG.md) | Task log tracking every phase and task |
| [docs/PROMPT.md](docs/PROMPT.md) | Session-start prompts for agents continuing this project |
| [docs/requirements/PRD.md](docs/requirements/PRD.md) | Product requirements — problem, goals, non-goals, success metrics |
| [docs/requirements/functional-requirements.md](docs/requirements/functional-requirements.md) | Numbered functional requirements (FR-*) |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | Full architecture diagram, component responsibilities, tech stack |
| [docs/architecture/data-flow.md](docs/architecture/data-flow.md) | Sequence diagrams for every major operation |
| [docs/architecture/api-design.md](docs/architecture/api-design.md) | MCP tool schemas, request/response formats, error codes |
| [docs/implementation/phases.md](docs/implementation/phases.md) | Phase-by-phase build plan with checkboxes |
| [docs/implementation/estimation.md](docs/implementation/estimation.md) | Effort estimates, dependencies, risks, milestones |
| [docs/knowledge/coding-standards.md](docs/knowledge/coding-standards.md) | File structure, naming, TypeScript rules, git conventions |
| [docs/knowledge/error-handling.md](docs/knowledge/error-handling.md) | Error format, exact error messages, handling layers |
| [docs/knowledge/security-standards.md](docs/knowledge/security-standards.md) | Security principles, data handling, permissions |
| [docs/knowledge/testing-guide.md](docs/knowledge/testing-guide.md) | Testing rules, test types, examples |
| [docs/knowledge/setup/install-guide.md](docs/knowledge/setup/install-guide.md) | Install prerequisites, steps, troubleshooting |
| [docs/knowledge/setup/usage-guide.md](docs/knowledge/setup/usage-guide.md) | How memory actually works day to day — first use, every session after, conflicts, searching |
| [docs/knowledge/setup/agent-instructions.md](docs/knowledge/setup/agent-instructions.md) | Making your AI agent prefer aimem over its own built-in memory — per-agent instruction file snippets |
| [docs/knowledge/setup/current-project-state.md](docs/knowledge/setup/current-project-state.md) | What exists right now vs. what's still pending |
| [docs/modules/](docs/modules/) | Per-component design docs (MCP server, storage, embeddings, capture, retrieval, conflict/versioning) |
| [docs/workflows/](docs/workflows/) | Step-by-step workflow walkthroughs for real usage scenarios |
| [docs/decisions/ADR.md](docs/decisions/ADR.md) | Architecture decision records — every major decision with its reasoning and trade-offs |

## License

[MIT](LICENSE) © 2026 Yogesh Joshi
