# aimem — Current Project State

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Overall Status

**Phase 8 Partially Complete — Awaiting Project Owner for Remaining Subtasks**

All code is written and verified (67 unit tests, 9 e2e tests, all passing). Packaging is verified end-to-end via `npm pack` + a real global install + `npx` invocation. Two critical, user-impacting bugs were found and fixed during that testing (see ADR-009, ADR-010) — both were invisible to all prior e2e testing because they only manifest when the compiled binary is invoked through a symlink, which is exactly how real installs work. What remains (cross-client configuration in Claude Code/Cursor, npm registry publish, daily real-world validation) genuinely requires the project owner's own machine, accounts, and time, and cannot be completed by an agent.

## What Exists Right Now

| Item | Status |
|---|---|
| Full documentation tree (this directory structure) | Complete |
| `README.md`, `RULES.md`, `AGENT-LOG.md`, `PROMPT.md` | Complete |
| `requirements/` (PRD, functional requirements) | Complete |
| `architecture/` (system overview, data flow, API design) | Complete |
| `implementation/` (phases, estimation) | Complete |
| `knowledge/` (coding standards, error handling, security, testing, setup guides) | Complete |
| `modules/` (per-component design docs) | Complete |
| `workflows/` (per-scenario flow docs) | Complete |
| `decisions/ADR.md` | Complete (10 ADRs — ADR-007 dependency version correction, ADR-008 lazy dependency construction fixing a server-crash-on-corrupted-file bug, ADR-009 shebang + nvm/PATH gotcha, ADR-010 `isMainModule` symlink-resolution fix) |
| `package.json`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.js`, `vitest.config.ts`, `vitest.e2e.config.ts` | Complete |
| `src/logger.ts`, `src/config.ts` | Complete |
| `src/mcp-server/resolve-project-root.ts` | Complete |
| `src/mcp-server/tool-router.ts` (ajv validation, full error classification incl. `EmbeddingModelUnavailableError`) | Complete, 8 unit tests passing (FR-ERR-04 leak audit) |
| `src/server.ts` (stdio MCP server entry point, 6 real tools, `LazyServerDependencies`) | Complete |
| e2e tests (`src/mcp-server/__tests__/server.e2e.test.ts`, 9 cases incl. cross-process pickup round trip, full conflict round trip, missing/corrupted-file, two-process concurrency, and a symlink-invocation regression test) | Complete, passing |
| `src/mcp-server/__tests__/error-messages.test.ts` (exact error-string coverage against error-handling.md) | Complete, 6 unit tests passing |
| `src/storage-engine/` (StorageEngine, migrations incl. `observation_embeddings`, types, errors, gitignore helper) | Complete, 19 unit tests passing |
| `src/embedding-search-engine/` (EmbeddingEngine, vector-index, coordinator) | Complete, 22 fast tests + 1 performance test (`npm run test:performance`) passing |
| `models/` bundled embedding model (~23MB, via `npm run postinstall`) | Complete |
| `src/capture-engine/` (CaptureEngine: store/scan/remember, dedup) | Complete, 15 unit tests passing |
| `src/retrieval-engine/` (RetrievalEngine: getProjectContext, search) | Complete, 6 unit tests passing |
| `src/conflict-versioning-engine/` (ConflictVersioningEngine: detectConflict, confirmUpdate) | Complete, 8 unit tests passing |
| Real MCP tools registered: `memory_store`, `memory_scan`, `memory_get_project_context`, `memory_search`, `memory_remember`, `memory_confirm_update` (all 6, live over stdio) | Complete |
| Packaging verified: `npm pack`, real global install into an isolated prefix, `npx --package=<tarball>` invocation, all working end-to-end with real tool calls | Complete |
| `scripts/bundle-embedding-model.mjs` correctly included in the published package (`files` allowlist fixed) | Complete |
| `#!/usr/bin/env node` shebang on `src/server.ts` (preserved through build) | Complete |
| `isMainModule` symlink-safe (`realpathSync`) — fixes the actual real-world install/npx path | Complete |

## What Does NOT Exist Yet

- Not yet configured/verified inside a real Claude Code, Cursor, or Windsurf client — **requires the project owner's own machine/IDE**
- Not yet published to the npm registry — **requires the project owner's own npm account**, entered via `npm login` in their own terminal
- No daily real-world personal-use validation period has started yet — **requires the project owner's own ongoing usage**

## Planned Full Repository Tree (Docs + Future Code)

```
aimem/
├── README.md
├── docs/
│   ├── RULES.md
│   ├── AGENT-LOG.md
│   ├── PROMPT.md
│   ├── requirements/
│   │   ├── PRD.md
│   │   └── functional-requirements.md
│   ├── architecture/
│   │   ├── system-overview.md
│   │   ├── data-flow.md
│   │   └── api-design.md
│   ├── implementation/
│   │   ├── phases.md
│   │   └── estimation.md
│   ├── knowledge/
│   │   ├── coding-standards.md
│   │   ├── error-handling.md
│   │   ├── security-standards.md
│   │   ├── testing-guide.md
│   │   └── setup/
│   │       ├── current-project-state.md
│   │       ├── install-guide.md
│   │       └── usage-guide.md
│   ├── modules/
│   │   ├── mcp-server.md
│   │   ├── storage-engine.md
│   │   ├── embedding-search-engine.md
│   │   ├── capture-engine.md
│   │   ├── retrieval-engine.md
│   │   └── conflict-versioning-engine.md
│   ├── workflows/
│   │   ├── developer-new-session-flow.md
│   │   ├── developer-active-session-capture-flow.md
│   │   └── conflict-resolution-flow.md
│   └── decisions/
│       └── ADR.md
│
│   ────────── DONE (Phases 1–7) ──────────
│
├── src/
│   ├── server.ts                      # DONE (6 real tools, LazyServerDependencies)
│   ├── config.ts                      # DONE
│   ├── logger.ts                      # DONE
│   ├── mcp-server/
│   │   ├── resolve-project-root.ts    # DONE
│   │   ├── tool-router.ts             # DONE (ajv validation + full error classification)
│   │   ├── tool-schemas.ts            # DONE (all 6 tool schemas + descriptions)
│   │   └── __tests__/
│   │       ├── server.e2e.test.ts     # DONE (9 cases, incl. symlink regression test)
│   │       ├── tool-router.test.ts    # DONE (FR-ERR-04 leak audit)
│   │       └── error-messages.test.ts # DONE (exact-string coverage)
│
│   ├── storage-engine/                # DONE (storage-engine.ts, types.ts, errors.ts,
│   │                                   #        ensure-gitignore.ts, migrations/, __tests__/)
│   ├── embedding-search-engine/       # DONE (embedding-engine.ts, vector-index.ts,
│   │                                   #        embedding-search-coordinator.ts, types.ts,
│   │                                   #        errors.ts, __tests__/)
│   ├── capture-engine/                # DONE (capture-engine.ts, dedup.ts, errors.ts,
│   │                                   #        types.ts, __tests__/)
│   ├── retrieval-engine/              # DONE (retrieval-engine.ts, types.ts, __tests__/)
│   └── conflict-versioning-engine/    # DONE (conflict-versioning-engine.ts, types.ts,
│                                       #        errors.ts, __tests__/)
├── models/                            # DONE (bundled ONNX model, ~23MB, gitignored)
├── scripts/
│   └── bundle-embedding-model.mjs     # DONE (postinstall step)
├── package.json                       # DONE
├── tsconfig.json                      # DONE
├── tsconfig.test.json                 # DONE
├── eslint.config.js                   # DONE
├── vitest.config.ts                   # DONE
└── vitest.e2e.config.ts               # DONE
```

## Phase Progress

| Phase | Status |
|---|---|
| Phase 0 — Documentation | Completed |
| Phase 1 — Project scaffold + MCP server skeleton | Completed |
| Phase 2 — SQLite storage engine + entity/relation schema | Completed |
| Phase 3 — sqlite-vec + local embedding model integration | Completed |
| Phase 4 — Automatic capture tools (three-tier trigger) | Completed |
| Phase 5 — New-session pickup + manual override | Completed |
| Phase 6 — Conflict detection + versioning | Completed |
| Phase 7 — Error handling + concurrency verification | Completed |
| Phase 8 — Packaging/install/publish + cross-client testing | Partially Completed — autonomous subtasks done; cross-client config, npm publish, and daily-use validation await the project owner |

## Update Instruction

Whenever a phase task is completed, update this file's "What Exists Right Now" / "What Does NOT Exist Yet" lists and the "Phase Progress" table to reflect the true current state, in the same commit as the code change and the corresponding [../../AGENT-LOG.md](../../AGENT-LOG.md) update. Do not let this file drift out of sync with reality — it is the first thing every new agent session reads (see [../../../README.md](../../../README.md) checklist step 3).
