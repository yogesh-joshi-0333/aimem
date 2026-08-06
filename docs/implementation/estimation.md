# aimem — Effort Estimation

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Effort Table

| Phase | Description | Estimated Hours |
|---|---|---|
| 1 | Project scaffold + MCP server skeleton | 6–9 |
| 2 | SQLite storage engine + entity/relation schema | 10–14 |
| 3 | sqlite-vec + local embedding model integration | 12–16 |
| 4 | Automatic capture tools (three-tier trigger support) | 8–12 |
| 5 | New-session pickup + manual override | 6–10 |
| 6 | Conflict detection + versioning | 8–12 |
| 7 | Error handling + concurrency verification | 8–10 |
| 8 | Packaging/install/publish + cross-client testing + real-world validation | 10–16 |

**Total estimate: 68–99 hours** (roughly 2–3 weeks of solo, part-time focused work, or 1.5–2.5 weeks full-time).

## Dependencies (Must Be Installed/Configured First)

| Dependency | Minimum Version | Notes |
|---|---|---|
| Node.js | `20.11.0` (LTS) | Native ESM, required runtime |
| npm | `10.0.0` | Package manager, publish target |
| Python + build tools (`node-gyp` prerequisites) | N/A | Required transitively by `better-sqlite3` native compilation on some platforms |
| Git | any recent | For `.gitignore` auto-append behavior and version control of the project itself |
| An MCP-compliant client for testing | any | Claude Code, Cursor, Windsurf, etc. — needed from Phase 1 smoke testing onward |

## Team Requirements

This is a **solo project**. One role covers all phases:

| Role | Phases | Notes |
|---|---|---|
| Solo developer | 1–8 | Responsible for design, implementation, testing, packaging, and real-world validation across every phase. No other roles are planned for v1. |

## Risk Factors

| Risk | Impact | Mitigation |
|---|---|---|
| AI may not reliably self-trigger automatic memory scans (instruction-following dependent, not guaranteed code execution) | High — core value proposition silently underperforms if capture is missed | No pre-built deterministic mechanism for v1; owner self-tests daily in real usage; jointly analyze reliability before deciding whether a v2 server-side deterministic safety net (tracked turns/tokens + injected reminders) is needed |
| Memory-scan operations (read, judge, embed, write) cost tokens/latency that could exceed savings from not re-explaining context | Medium — could undermine the original motivation if overhead is too high | Explicit design constraint: scan/store operations must stay lightweight relative to tokens saved; monitor in Phase 8 real-world validation |
| Different MCP clients/models vary in instruction-following reliability, causing inconsistent behavior across Claude Code vs. Cursor vs. Gemini CLI etc. | Medium — inconsistent user experience across clients | Cross-client testing in Phase 8 across at least two clients; document any client-specific reliability gaps without adding client-specific code branches |
| `better-sqlite3` / `sqlite-vec` native module build issues on some OS/architectures | Medium — could block install for non-technical users | Prebuilt binaries preferred where available; documented troubleshooting in [knowledge/setup/install-guide.md](../knowledge/setup/install-guide.md) |
| Embedding model bundling increases package size / install time | Low — friction, not a functional blocker | MiniLM-class model chosen specifically for small footprint; verified at Phase 8 packaging |

## Milestones

| Milestone | Target Phase(s) | Definition of Done |
|---|---|---|
| M1 — Server skeleton runs | Phase 1 | MCP server starts, responds to `list_tools` over stdio |
| M2 — Structured memory persists | Phase 2 | Entities/relations/observations CRUD verified against real SQLite file |
| M3 — Semantic search works offline | Phase 3 | Vector search returns correct top match with network disabled |
| M4 — Automatic capture loop complete | Phase 4–5 | Full MVP loop (capture + retrieval) functions end-to-end |
| M5 — Trustworthy conflict handling | Phase 6 | Conflicting writes require confirmation and preserve history |
| M6 — Production-hardened | Phase 7 | Missing/corrupted file handling and concurrency verified by tests |
| M7 — Publicly installable + validated | Phase 8 | npm install works cross-platform; validated across 2+ MCP clients; daily real-world use underway |

See also: [phases.md](phases.md), [../requirements/PRD.md](../requirements/PRD.md) (Risks section source material).
