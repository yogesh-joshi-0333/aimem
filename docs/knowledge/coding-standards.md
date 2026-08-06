# aimem — Coding Standards

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## File / Folder Structure

```
aimem/
├── src/
│   ├── server.ts                      # MCP server entry point, tool registration
│   ├── config.ts                      # constants: paths, model names, defaults
│   ├── logger.ts                      # structured logger (no console.log elsewhere)
│   ├── mcp-server/
│   │   ├── tool-router.ts
│   │   └── __tests__/
│   │       └── tool-router.test.ts
│   ├── storage-engine/
│   │   ├── storage-engine.ts
│   │   ├── migrations/
│   │   │   ├── 001-init-schema.sql
│   │   │   └── 002-conflict-versioning.sql
│   │   └── __tests__/
│   │       └── storage-engine.test.ts
│   ├── embedding-search-engine/
│   │   ├── embedding-engine.ts
│   │   ├── vector-index.ts
│   │   └── __tests__/
│   │       └── embedding-engine.test.ts
│   ├── capture-engine/
│   │   ├── capture-engine.ts
│   │   └── __tests__/
│   │       └── capture-engine.test.ts
│   ├── retrieval-engine/
│   │   ├── retrieval-engine.ts
│   │   └── __tests__/
│   │       └── retrieval-engine.test.ts
│   └── conflict-versioning-engine/
│       ├── conflict-versioning-engine.ts
│       └── __tests__/
│           └── conflict-versioning-engine.test.ts
├── models/                            # bundled ONNX embedding model files
├── package.json
├── tsconfig.json
├── eslint.config.js
└── vitest.config.ts
```

One module = one directory under `src/`, matching the corresponding file in [modules/](../modules/).

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Files | `kebab-case.ts` | `conflict-versioning-engine.ts` |
| Classes | `PascalCase` | `ConflictVersioningEngine` |
| Interfaces/Types | `PascalCase`, no `I` prefix | `ObservationRecord` |
| Functions/variables | `camelCase` | `detectConflict()` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_SEARCH_LIMIT` |
| Enum-like string unions | `snake_case` values | `"event" \| "turn_scan" \| "context_threshold_scan" \| "manual"` |
| Test files | `<subject>.test.ts` in `__tests__/` | `storage-engine.test.ts` |
| SQL migration files | `NNN-description.sql`, zero-padded, sequential | `002-conflict-versioning.sql` |

## TypeScript Rules

- `strict: true` in `tsconfig.json`, plus `noImplicitAny`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` all enabled.
- ESM only: `"type": "module"` in `package.json`; all relative imports use explicit `.js` extensions in source (per Node ESM resolution).
- No `any` in committed code — use `unknown` plus a type guard, or a precise generated type from the JSON schema.
- All public module methods have explicit return types (no inferred-only public API surfaces).
- All MCP tool input/output types are defined once in a shared `types.ts` per module and imported everywhere they're used — no duplicated inline shapes.
- No default exports — always named exports, for consistent refactors and searchability.

## Logging Rules

- Use the structured logger in `src/logger.ts` exclusively — never `console.log`/`console.error` directly in any other file.
- Log levels: `debug`, `info`, `warn`, `error`. Default runtime level is `info`.
- Log format: single-line JSON: `{ "level": "...", "msg": "...", "ts": "...", ...context }`.
- NEVER log memory content — this includes entity names, observation text, attribute values, and search queries — at any log level, including `debug`. Log only metadata: counts, durations, error codes, table names.
- NEVER log full file-system paths beyond the project-relative `.aimem/` segment.

## Git Commit Message Format

```
<type>(<scope>): <one-line summary, imperative mood>

<optional body — why, not what>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Scope is the module directory name (e.g. `storage-engine`, `capture-engine`).

Example: `feat(conflict-versioning-engine): archive prior value on confirmed update`

## Build Notes

- `tsc` only compiles `.ts` files — it does NOT copy non-TypeScript assets (e.g. `src/storage-engine/migrations/*.sql`) into `dist/`. The `build` script therefore runs `tsc` followed by `copy-migrations` (a plain `cp`/`mkdir -p`, see `package.json`), which copies `src/storage-engine/migrations/*.sql` into `dist/storage-engine/migrations/`. This was missed initially and only surfaced when the compiled server was actually run (unit/integration tests import from `src/` directly via vitest+esbuild and never hit this gap) — always verify new build-time asset dependencies with an e2e test that runs the real compiled `dist/server.js`, not just unit tests against `src/`.
- The `copy-migrations` script uses POSIX shell (`cp`, `mkdir -p`) and is not verified on Windows; revisit for cross-platform correctness during Phase 8 packaging.

## Pre-Completion Checklist

- [ ] Code follows the naming conventions above
- [ ] No `any`, no `console.log`, no hardcoded paths/model names/table names
- [ ] Public methods have explicit return types
- [ ] Tests added/updated per [testing-guide.md](testing-guide.md), storage layer not mocked
- [ ] Relevant docs updated per [RULES.md](../RULES.md) Rule 7 sync table
- [ ] `AGENT-LOG.md` row updated to `Completed`
- [ ] `implementation/phases.md` checkbox checked, if applicable
- [ ] `npm run lint` and `npm test` both pass locally

See also: [../RULES.md](../RULES.md), [testing-guide.md](testing-guide.md), [error-handling.md](error-handling.md).
