# aimem — RULES.md

**Version:** v0.1.0-planning
**Date:** 2026-08-05

These rules are enforceable, not aspirational. Every agent (human or AI) working on this codebase must follow them exactly.

## Rule 0 — Read Before You Code

Before writing any code, read these 9 files in order:

1. [RULES.md](RULES.md) (this file)
2. [AGENT-LOG.md](AGENT-LOG.md)
3. [knowledge/setup/current-project-state.md](knowledge/setup/current-project-state.md)
4. [requirements/PRD.md](requirements/PRD.md)
5. [requirements/functional-requirements.md](requirements/functional-requirements.md)
6. [architecture/system-overview.md](architecture/system-overview.md)
7. [architecture/api-design.md](architecture/api-design.md)
8. [implementation/phases.md](implementation/phases.md)
9. The relevant file in [modules/](modules/) for the component you are touching

## Rule 1 — Tech Stack (Exact Versions, No Deviations)

| Component | Choice | Version | Notes |
|---|---|---|---|
| Language | TypeScript | `^5.5.0` | strict mode mandatory |
| Runtime | Node.js | `>=20.11.0 <21` (LTS) | enforced via `engines` in package.json |
| Module system | ESM | N/A | `"type": "module"` in package.json, no CommonJS |
| MCP SDK | `@modelcontextprotocol/sdk` | `^1.0.0` | official SDK only, no custom protocol implementation |
| Storage | SQLite via `better-sqlite3` | `^11.0.0` | synchronous API, WAL mode enabled at connection open |
| Vector search | `sqlite-vec` | `^0.1.6` | loaded as SQLite extension, same file |
| JSON Schema validation | `ajv` | `^8.20.0` | validates every MCP tool input against its declared schema at the tool-router boundary (FR-SEC-04); added during Phase 4 |
| Embeddings | `@xenova/transformers` (transformers.js) | `^2.17.0` | MiniLM-class model, bundled at install time |
| Test runner | `vitest` | `^2.0.0` | no other test runner permitted |
| Linter | `eslint` `^9.0.0` with `@typescript-eslint` `^8.66.0` | see Notes | flat config; `@typescript-eslint` major 8 pairs with `eslint` major 9 — there is no `@typescript-eslint` major 9 on npm as of 2026-08-05, corrected during Phase 1 scaffolding, see [decisions/ADR.md](decisions/ADR.md) ADR-007 |
| Linter globals | `globals` | `^17.9.0` | supplies the Node.js global identifier set (`process`, etc.) to the ESLint flat config; added during Phase 1 scaffolding |
| Package manager | `npm` | `>=10.0.0` | no yarn/pnpm lockfiles committed |

No dependency may be added or version changed without updating this table in the same commit/PR.

## Rule 2 — Data / Message Format Standards

- All MCP tool inputs/outputs are JSON, UTF-8, matching the schemas in [architecture/api-design.md](architecture/api-design.md) exactly — no undocumented fields.
- All timestamps are ISO 8601 UTC strings, field name `created_at` / `updated_at` (e.g. `"2026-08-05T14:32:00.000Z"`).
- All entity IDs are lowercase UUIDv4 strings, field name `id`.
- Entity type field is always `entity_type` (e.g. `"person"`, `"decision"`, `"credential"`, `"architecture_fact"`).
- Confidence/salience scores are floats in range `[0.0, 1.0]`, field name `confidence`.
- Version history rows use field name `version` (integer, starting at `1`, incrementing).
- All database column names are `snake_case`; all TypeScript object keys crossing the MCP boundary are also `snake_case` to match wire format exactly (no camelCase↔snake_case translation layer at the boundary).

## Rule 3 — Naming Conventions

| Item | Convention | Example |
|---|---|---|
| TypeScript files | `kebab-case.ts` | `storage-engine.ts` |
| Classes | `PascalCase` | `StorageEngine` |
| Functions/variables | `camelCase` | `storeMemory()` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_ENTRIES_PER_PROJECT` |
| MCP tool names | `memory_<verb>` snake_case | `memory_store`, `memory_search` |
| SQLite tables | `snake_case`, plural | `entities`, `relations`, `observations` |
| Test files | `<subject>.test.ts`, colocated in `__tests__/` | `storage-engine.test.ts` |

## Rule 4 — Security Rules (Non-Negotiable)

- The server binds to no network port, ever. Transport is stdio only.
- No credential, secret, or memory content is ever logged at any log level.
- No telemetry, analytics, or outbound network call of any kind at runtime.
- `.aimem/` must be added to the project's `.gitignore` by the install/init routine — never committed.
- No auto-execution of any content retrieved from memory (memory is data, never code/commands).
- Full rules: [knowledge/security-standards.md](knowledge/security-standards.md)

## Rule 5 — Agent Log Updates (Mandatory Before/After Every Task)

- Before starting any task: add/update its row in [AGENT-LOG.md](AGENT-LOG.md) Task Log with Status = `In Progress` and `Started` timestamp.
- After completing any task: update the same row with Status = `Completed`, `Completed` timestamp, and a one-line Notes entry.
- If blocked: set Status = `Blocked` and explain the blocker in Notes before stopping work.
- No task is considered done until its AGENT-LOG.md row says `Completed`.

## Rule 6 — Testing Rules

- Every task that adds or changes behavior requires tests in the same commit.
- Never mock the SQLite storage layer — tests use a real temporary SQLite file created per test (see [knowledge/testing-guide.md](knowledge/testing-guide.md)).
- Never mock the embedding model in integration/e2e tests — unit tests may stub embedding output only when explicitly testing non-embedding logic.
- Never mock the MCP transport in e2e tests — spawn the real server process over stdio.
- Minimum coverage: every public method of every module in [modules/](modules/) has at least one unit test.

## Rule 7 — Documentation Sync Rule

| Code change | Doc(s) that MUST be updated in the same commit |
|---|---|
| New/changed MCP tool | [architecture/api-design.md](architecture/api-design.md) |
| New/changed DB table or column | [architecture/system-overview.md](architecture/system-overview.md), relevant [modules/](modules/) file |
| New/changed error case | [knowledge/error-handling.md](knowledge/error-handling.md) |
| New/changed capture trigger logic | [modules/capture-engine.md](modules/capture-engine.md), [workflows/developer-active-session-capture-flow.md](workflows/developer-active-session-capture-flow.md) |
| New/changed conflict logic | [modules/conflict-versioning-engine.md](modules/conflict-versioning-engine.md), [workflows/conflict-resolution-flow.md](workflows/conflict-resolution-flow.md) |
| Phase task completed | [implementation/phases.md](implementation/phases.md) checkbox, [AGENT-LOG.md](AGENT-LOG.md) |
| Architectural decision made/changed | [decisions/ADR.md](decisions/ADR.md) new entry (never edit past ADRs — append only) |

## Rule 8 — File / Structure Rules

- All source code lives under `aimem/src/`, never inside the docs tree.
- All documentation (this file and everything alongside it) lives under `aimem/docs/`. The project root contains only `README.md`, source code (`src/`, `scripts/`), and config/build files — no other `.md` file belongs at the root.
- Docs (this tree) are never mixed with source code files.
- One module = one directory under `src/` matching its doc in `modules/` (e.g. `modules/storage-engine.md` ↔ `src/storage-engine/`).
- See [knowledge/coding-standards.md](knowledge/coding-standards.md) for the full source tree layout.

## Rule 9 — Error Handling Rules

- The server must never crash the host process on a handled error — catch at the tool-handler boundary and return a structured error response.
- Every error response follows the exact JSON format in [knowledge/error-handling.md](knowledge/error-handling.md).
- Missing `.aimem/memory.db` is NOT an error — treat as fresh start, no warning.
- Corrupted `.aimem/memory.db` (exists but unreadable/malformed) IS an error — must return the exact corrupted-file error message, never silently discard the file.
- No stack traces are ever included in a response sent back over MCP.

## Rule 10 — Phase Discipline

- Work exactly one phase at a time per [implementation/phases.md](implementation/phases.md).
- Do not start Phase N+1 tasks while Phase N has unchecked boxes, unless explicitly instructed otherwise.
- Mark a task `- [x]` in phases.md only after its tests pass and AGENT-LOG.md reflects `Completed`.
- Do not reorder or skip phases without recording the reason as a new ADR entry.

## Rule 11 — What NOT To Do

- Do NOT build any V2/deferred feature listed in [requirements/PRD.md](requirements/PRD.md) Non-Goals — this includes CLI/web UI, multi-user/RBAC, cross-project memory, cloud sync, pluggable backends, multi-agent shared memory, field-level encryption, or a deterministic server-side scan-reminder mechanism.
- Do NOT use `console.log` for anything other than the structured logger defined in [knowledge/coding-standards.md](knowledge/coding-standards.md).
- Do NOT hardcode file paths, model names, or table names — use the constants module.
- Do NOT add scope beyond the 10 v1 features in the PRD without first adding an ADR explaining the change.
- Do NOT introduce a network server, Docker dependency, or mandatory external API key — this breaks the zero-dependency design constraint.
- Do NOT silently overwrite conflicting memory values — always confirm-before-update per [modules/conflict-versioning-engine.md](modules/conflict-versioning-engine.md).
- Do NOT commit `.aimem/` contents from this repo or any test fixture project into git history.
