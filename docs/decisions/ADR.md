# aimem — Architecture Decision Records

**Version:** v0.1.0-planning
**Date:** 2026-08-05

Append-only log. Never edit a past ADR's decision retroactively — if a decision changes, add a new ADR that supersedes it and note the supersession in both entries.

---

## ADR-001: Build From Scratch in Node.js/TypeScript Rather Than Adopt/Fork an Existing Memory Tool

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** Build aimem from scratch in Node.js/TypeScript rather than adopting or forking an existing memory tool (Mem0, Zep, Graphiti, the official MCP reference memory server, or alfredoizdev/contextforge-mcp).

**Reason:** Direct verification of these projects, plus a broader GitHub search, confirmed no existing project combines all three of: (1) memory stored inside the project's own folder (portable with it), (2) zero external dependencies (no Docker, no DB server, no mandatory API key), and (3) automatic/invisible capture rather than explicit-tool-call-only. Existing tools split into two camps: heavyweight+global (Mem0/Zep/Graphiti — require Docker/Postgres/Neo4j/Qdrant, user_id/session-scoped rather than folder-scoped) or lightweight+global (the official reference server and SQLite/JSON forks — zero deps but store in a fixed global OS location like `~/mcp-data/...`, explicit-tool-call-only). This specific combination is a genuine, verified gap, not a case of reinventing an existing wheel.

**Consequences:** All protocol, storage, capture, and retrieval logic must be designed and maintained in-house rather than inheriting a mature codebase's edge-case handling — higher initial build effort (see [implementation/estimation.md](../implementation/estimation.md)), but full control over the exact folder-scoping, zero-dependency, and automatic-capture properties the project requires. Design concepts (not code) are reused from the official reference server's entity/relation/observation schema and Mem0's automatic-capture judgment pattern.

---

## ADR-002: SQLite + sqlite-vec for Storage, Not Postgres/pgvector, a Standalone Graph DB, or Obsidian

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** Use SQLite (via `better-sqlite3`) plus the `sqlite-vec` extension as the sole storage layer, modeling the graph structure relationally rather than using a dedicated graph database, and rejecting Obsidian as a storage substrate.

**Reason:** SQLite provides zero external dependencies (no Docker, no DB server process), a single portable file that travels with the project, "good enough" graph modeling via relational tables (entities/relations/observations) for a single-project scale, and performance sufficient for thousands of entries when properly indexed. Postgres/pgvector and standalone graph DBs (Neo4j, Kuzu) were rejected because they require a running server process, violating the zero-dependency, non-technical-friendly install goal. Obsidian was specifically considered and rejected because it is a note-taking application with no reliable background-server integration path — using it would require Obsidian itself to be installed and running, which breaks the same zero-dependency goal and adds a hard external-app dependency that most target users would not already have.

**Consequences:** Graph queries (e.g. multi-hop relation traversal) are implemented as relational joins rather than native graph traversal, which is adequate at v1's target scale (thousands of entries per project) but would need reconsideration if a future version required much larger graphs or complex multi-hop queries. Vector search is bounded by `sqlite-vec`'s current maturity level rather than a dedicated vector database's feature set.

---

## ADR-003: Local On-Device Embedding Model, Bundled at Install Time, Not a Cloud Embedding API

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** Generate embeddings using a locally bundled MiniLM-class ONNX model via `transformers.js`, bundled into the package at install time, rather than calling a cloud embedding API, and rather than downloading the model on first use.

**Reason:** A cloud embedding API would require a mandatory API key and a network call at runtime, violating the offline, zero-API-key, zero-cost, local-only requirements that are core to the project's value proposition (memory that never leaves the machine). Bundling at install time (versus downloading on first use) was chosen specifically so the first real run has zero surprise downloads or first-call latency spikes — the trade-off of a larger npm package size is accepted deliberately in exchange for a predictable, fully-offline-from-the-start experience.

**Consequences:** The npm package is larger than a typical Node CLI tool due to the bundled model files, and the model's capability is fixed to whatever MiniLM-class quality is chosen at build time — upgrading the embedding model requires a new aimem release, not a runtime configuration change. No cloud-quality embedding models (e.g. large proprietary embedding APIs) are available even as an opt-in v1 enhancement.

---

## ADR-004: Memory Stored Inside the Project's Own Folder (.aimem/), Not a Global OS-Level Location

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** Store each project's memory in a `.aimem/` folder inside that project's own directory, rather than in a global OS-level location (e.g. `~/mcp-data/<project-hash>/`).

**Reason:** Folder-local storage means memory is portable with the project — it survives renames and moves of the project directory, avoids orphaned global state accumulating for deleted or relocated projects, and keeps each project's memory fully isolated and self-contained, matching the project-scoped (not cross-project/global) design of v1. This is also the specific property that no existing lightweight MCP memory server (which all default to a fixed global location) provides, per the research referenced in ADR-001.

**Consequences:** Memory does not follow the user across different clones/checkouts of the same logical project unless `.aimem/` itself is copied — which is intentional, since `.aimem/` is gitignored and never committed. Cross-project or global memory sharing is explicitly out of scope for v1 as a direct consequence of this decision (see [requirements/PRD.md](../requirements/PRD.md) Non-Goals).

---

## ADR-005: Three-Tier AI-Self-Driven Capture Trigger Model, Not a Background Process Tailing Client Session Logs

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** Implement automatic capture via three AI-self-driven triggers (event-based, turn-count-based, context-threshold-based) expressed through MCP tool descriptions and instruction-following, rather than a background process that tails and parses client-specific session log files.

**Reason:** Driving capture through the MCP protocol itself (tool calls the AI chooses to make, guided by carefully written tool descriptions) keeps the entire system clean and client-agnostic, consistent with the "no client-specific hacks" requirement — a log-tailing approach would require fragile, client-specific file-format parsing for each of Claude Code, Cursor, Windsurf, Gemini CLI, Codex, etc., and would break silently whenever any client changed its internal log format. The accepted trade-off is reliance on model instruction-following reliability rather than guaranteed code execution.

**Consequences:** This is the project's biggest named risk (see [requirements/PRD.md](../requirements/PRD.md) Risks and [implementation/estimation.md](../implementation/estimation.md)) — capture may be silently missed if a given model/client doesn't reliably follow the trigger instructions, and reliability may vary across clients. No deterministic server-side fallback (tracked turns/tokens with injected reminders) is built in v1; the project owner will self-test daily in real usage and jointly evaluate whether such a fallback becomes necessary for v2, per the explicit deferral in the PRD Non-Goals.

---

## ADR-006: Confirm-Before-Update With Versioned History for Conflicts, Not Silent Auto-Overwrite or Silent Discard

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** When newly captured information contradicts an existing stored value for the same entity/attribute, halt the write, surface a structured conflict requiring explicit user confirmation via `memory_confirm_update`, and on confirmation, archive the superseded value into a version history table rather than deleting it.

**Reason:** Silently auto-overwriting risks corrupting critical facts (credentials, architecture decisions) based on a possibly-mistaken automatic judgment; silently discarding the new information risks losing a real, intentional change the user just stated. Confirm-before-update with archival preserves both safety and the project's "remember WHY, not just WHAT" principle — the history of how a decision evolved (e.g. MySQL → PostgreSQL, and why) is itself valuable memory, not just the current value.

**Consequences:** Every conflicting update requires one extra round-trip confirmation step, adding a small amount of friction and token/latency overhead to the affected turn — an accepted cost given the alternative risks of silent corruption or silent data loss. Version history tables (`observation_versions`, `conflicts`) add schema and query complexity beyond a simple key-value store, which must scale correctly alongside primary data as entry counts grow into the thousands (see FR-STORE-07).

---

## ADR-007: Corrected `@typescript-eslint` Version Pin From `^9.0.0` to `^8.66.0` During Phase 1 Scaffolding

**Date:** 2026-08-05
**Status:** Accepted

**Decision:** Change the `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` version pin in [../RULES.md](../RULES.md) Rule 1 from `^9.0.0` to `^8.66.0`.

**Reason:** The original documentation set the version by analogy with `eslint`'s own major (9.x) without checking the actual npm registry. `npm install` failed with `ETARGET` because no `@typescript-eslint` major-9 release exists as of 2026-08-05 (latest published is `8.66.0`, which is the version line intended to pair with `eslint` 9.x). Verified directly via `npm view @typescript-eslint/eslint-plugin versions` before correcting.

**Consequences:** No functional change to the linting setup — `@typescript-eslint` 8.x is the correct, currently-maintained major for `eslint` 9.x flat config. This ADR exists per RULES.md Rule 10 (any phase deviation/correction must be recorded) and Rule 1 (no version change without updating the table in the same commit). Future dependency version pins added to RULES.md should be checked against the npm registry before being written down, not inferred by pattern-matching against a sibling package's version.

---

## ADR-008: Lazy Construction of ServerDependencies (StorageEngine et al.), Not Eager at Server Startup

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** `server.ts` no longer constructs `StorageEngine` (and the engines that depend on it — `CaptureEngine`, `RetrievalEngine`, `ConflictVersioningEngine`) eagerly inside `startServer()`. Construction is deferred to a `LazyServerDependencies` wrapper whose `get()` method builds and caches the real dependencies on first access, which in practice means the first incoming tool call.

**Reason:** `StorageEngine`'s constructor throws `StorageCorruptedError` synchronously when `.aimem/memory.db` exists but fails its SQLite integrity check (see [ADR corrections in error-handling.md](../knowledge/error-handling.md)). With eager construction at startup, this error propagated out of `startServer()` itself, was caught only by the top-level `isMainModule` `.catch()` block, logged, and then the process exited — meaning the AI client's MCP connection was torn down entirely (`MCP error -32000: Connection closed`) rather than receiving the documented `STORAGE_CORRUPTED` tool response. This was found via an e2e test (added in Phase 7) that pre-corrupts `.aimem/memory.db` before spawning the server and asserts the connection survives. It directly violated RULES.md Rule 9 ("never crash the host process on a handled error") and FR-ERR-02 ("must return the exact corrupted-file error... must NOT silently discard or overwrite it" — implicitly requiring the server to still be alive to return anything at all).

**Consequences:** The server now always starts successfully and responds to `list_tools` regardless of the on-disk storage state — corruption is only discovered (and gracefully classified) when a tool call actually touches storage, inside `ToolRouter`'s existing try/catch boundary. This is a strictly better property with no real downside: v1 has no tool that needs storage to be valid merely to exist as a registered tool. `LazyServerDependencies.get()` only caches a *successful* construction — a failed attempt leaves the cache empty, so every subsequent tool call retries construction and (on a still-corrupted file) re-throws independently; this is intentional, since it means a user fixing/replacing the corrupted file mid-session doesn't require restarting the server for aimem to notice.

---

## ADR-009: Added Node Shebang to server.ts; Documented the nvm/PATH Executable-Resolution Gotcha Rather Than "Fixing" It in Code

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** Added `#!/usr/bin/env node` as the first line of `src/server.ts` (preserved verbatim by `tsc` into `dist/server.js`), and documented — rather than attempted to silently work around — a real environment gotcha found during Phase 8 packaging testing: when Node.js is installed via a version manager (`nvm`, `fnm`, `volta`), `node` is often absent from the minimal `PATH` that MCP clients use to spawn subprocesses, causing `env: 'node': No such file or directory` and a silent connection failure with no error text visible to the AI client.

**Reason:** `npm pack` + a real global install into an isolated prefix, followed by executing the installed `aimem` binary directly (not via `node dist/server.js`), initially produced *zero output on stdout or stderr* and an immediate MCP "Connection closed" error — a serious bug that would have affected every real user, since global install + direct binary execution is the documented, expected install path (`npm install -g aimem` then registering `aimem` as the MCP command). Root-caused via `env -i /usr/bin/env node -e "..."`, which reproduced the exact failure by stripping the environment `nvm` normally injects into interactive shells. This is not a bug in aimem's own code — `#!/usr/bin/env node` is the standard, correct shebang for a portable Node CLI — it is an inherent property of how shebang resolution and nvm's shell-hook-based `PATH` injection interact, and it cannot be "fixed" by aimem itself (an npm package cannot control the PATH environment its own shebang line resolves against once invoked by a third-party client's subprocess spawn).

**Consequences:** Added a prominent, specific troubleshooting entry in [../knowledge/setup/install-guide.md](../knowledge/setup/install-guide.md) instructing users on nvm-based Node installs to point their MCP client's config directly at an absolute `node` path plus an absolute path to `dist/server.js`, rather than relying on a bare `aimem` command string. This is a real, foreseeable friction point for the "must be single-command install, easy for non-technical users" goal (see [../requirements/PRD.md](../requirements/PRD.md) Constraints) that could not be fully eliminated — it can only be documented clearly and diagnosed quickly when a real user hits it. Revisit in a future version if this proves to be a common source of support burden (e.g. a wrapper script that resolves and re-execs with an absolute node path could mitigate it, at the cost of added complexity not justified for v1 without confirmed real-world frequency).

---

## ADR-010: Fixed `isMainModule` to Resolve Symlinks (`realpathSync`) Before Comparing to `import.meta.url`

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** `server.ts`'s `isMainModule` check now resolves `process.argv[1]` via `realpathSync` before comparing it against `import.meta.url`, instead of comparing the raw, unresolved `process.argv[1]` directly.

**Reason:** Both `npm install -g` and `npx` install a package's `bin` entry as a **symlink** (e.g. `node_modules/.bin/aimem -> ../aimem/dist/server.js`). When Node is invoked *through* that symlink, `import.meta.url` for the ESM entry module resolves to the real, symlink-target path, while `process.argv[1]` retains the literal (symlinked) path the process was launched with. The original `isMainModule` check compared these two directly and — for every symlink-based invocation, i.e. the two most common real-world install paths (`npm install -g aimem` then running the bare `aimem` command, and `npx aimem`) — always evaluated to `false`. The practical effect: the process started, loaded all its module code, logged nothing, connected no stdio transport, and exited cleanly with code 0 almost immediately, with zero output on either stdout or stderr. This was found via `npm pack` + `npx --package=<tarball> -- aimem` testing in Phase 8; direct invocation via `node dist/server.js` (used throughout all of Phases 1-7's e2e tests) never exercises this path, because there `process.argv[1]` and `import.meta.url` already refer to the same literal file with no symlink indirection — which is exactly why this bug went undetected through 7 prior phases of otherwise-thorough e2e testing.

**Consequences:** This was arguably the most user-impactful bug found in the entire project so far — it would have silently broken the server for essentially every real-world install method (global install + bare command, and `npx`), while working perfectly for a developer running `node dist/server.js` directly during development, making it very easy to ship without ever noticing. Verified fixed via a full round-trip test: cleared the npx cache, repacked, reinstalled globally, and confirmed `aimem_starting`/`aimem_started` log lines appear and all 6 tools respond correctly when launched through the real `bin/aimem` symlink (both via a fresh `npx --package=<tarball>` invocation and a real `npm install -g` + direct symlink invocation). No unit or e2e test in the existing suite exercises this specific symlink-invocation path (all spawn `dist/server.js` directly, matching how the SDK's own `StdioClientTransport` is used in the e2e suite) — a real gap in test coverage that a future phase could close by adding an e2e case that spawns through a symlinked `bin`-style shim rather than the compiled file directly, though doing so inside the existing fast test suite would require constructing a temporary symlink per test rather than a full `npm pack`/install cycle.

---

## ADR-011: npm Package Renamed from `aimem` to `aimem-mcp`

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** The npm package name is `aimem-mcp`, not `aimem`. The installed CLI command remains `aimem` (unaffected — the `bin` field in `package.json` maps the command name `aimem` to `dist/server.js` independently of the package name). The project's own identity, GitHub repo name, source directory names, and all internal documentation continue to refer to the project as "aimem."

**Reason:** The first real `npm publish` attempt was rejected by the registry with `403 Package name too similar to existing package ai-mem`. Investigation confirmed `ai-mem` (published, `github.com/ChrisL108/aimem`) is a directly competing package in the same space — "semantic memory for AI coding assistants," same keywords (`claude-code`, `semantic-memory`, `embeddings`). Rather than accept npm's suggested scoped-name workaround (`@yogesh-joshi/aimem`, which ties the package identity to a personal npm username the project may outgrow) or fight the collision, `aimem-mcp` was chosen: available on the registry, keeps the recognizable "aimem" root intact across every existing doc/ADR/code comment/GitHub repo, and the `-mcp` suffix is accurate (it genuinely is an MCP server) and mildly differentiates it from `ai-mem`'s LanceDB-based, non-MCP-first design.

**Consequences:** Every *package-install* instruction (`npm install -g <name>`, `npx <name>`) must say `aimem-mcp`, not `aimem` — fixed in [README.md](../../README.md) and [knowledge/setup/install-guide.md](../knowledge/setup/install-guide.md). The *CLI command* a user types after installing, and every reference to the project/tool by name in prose, remains `aimem` — no other renaming was needed. `package.json`'s `name` field was changed; nothing else in `package.json` (the `bin` map, `files`, dependencies) required any change.

---

## ADR-012: Server Reports Its MCP Protocol Version by Reading `package.json`, Not a Hardcoded String

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** `server.ts` reads its version for the MCP `Server` constructor (`{ name: "aimem", version: ... }`) from the installed package's own `package.json` at runtime, rather than a hardcoded string literal.

**Reason:** The version reported to MCP clients (`server.js:156`, previously `version: "0.1.0"` hardcoded) drifted out of sync with `package.json`'s `version` field the moment `package.json` was bumped to `0.1.1` for a docs-only npm republish — found while updating version references for that republish. A hardcoded second copy of the version number is exactly the kind of easy-to-forget duplication this project has otherwise avoided (see `EMBEDDING_MODEL_NAME`, `AIMEM_DIR_NAME`, etc. in `config.ts`, all single-sourced constants).

**Consequences:** `server.ts` resolves its own package root the same way `embedding-engine.ts` already does (via `fileURLToPath(import.meta.url)` + relative `join`), then reads and parses `package.json` once at startup. This has a small, one-time startup cost (a synchronous file read) that's negligible next to the embedding model's own lazy-load cost, and permanently eliminates the two-places-to-update problem — every future version bump only requires changing `package.json`.

---

## ADR-013: Tool Descriptions Explicitly Say "Prefer This Over Your Own Built-In Memory"; Added a Cross-Agent Instruction-File Doc

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** All five capture/retrieval tool descriptions (`memory_store`, `memory_scan`, `memory_get_project_context`, `memory_search`, `memory_remember`) now explicitly instruct the calling AI to prefer aimem over any other memory system it may have (e.g. an agent's own built-in session memory), not just describe what the tool does. Added [knowledge/setup/agent-instructions.md](../knowledge/setup/agent-instructions.md) documenting project-level instruction-file snippets (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`, etc.) that reinforce this at the project-instruction level, across every major agent's own convention.

**Reason:** Real-world first use (the project owner's first live test in a separate project, connected via a published `aimem-mcp` install) surfaced exactly the risk already flagged in [../requirements/PRD.md](../requirements/PRD.md) Risks: asked to "save all important information," the connected AI agent used its own built-in memory system instead of calling any aimem tool, despite aimem being connected and healthy. Confirmed via `memory_get_project_context` returning `has_memory: false` after the fact — the MCP connection worked correctly; the agent simply chose not to use it for that request.

**Consequences:** This is a mitigation, not a fix — an MCP tool can never force an agent to call it; the agent always chooses per turn. Two levers were used together: (1) tool descriptions now say "PREFERRED" / "MANDATORY" language rather than purely descriptive text, and (2) a documented, copy-paste project-instruction-file snippet gives users a way to reinforce the same instruction at the project level, across any of the 8+ agent conventions surveyed (Claude Code, Cursor, Windsurf, Copilot, Cline, Roo Code, Codex, Gemini CLI), including the emerging `AGENTS.md` cross-tool standard. Neither guarantees compliance — this remains the project's single biggest known risk (see PRD Risks) and should be watched during the ongoing real-world validation period, not considered resolved.

---

## ADR-014: Rejected Feature-Parity Chase Against ai-memory-mcp; Phase 9 Invests in Quality Within Existing Scope Instead

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** After a source-verified competitive comparison against `alphaonedev/ai-memory-mcp` (a mature, enterprise-oriented MCP memory project — namespace/team/org visibility, Postgres+Apache AGE at scale, Ed25519 write attestation, distributed multi-agent coordination, 101 MCP tools at full profile), the project explicitly does **not** adopt any of that feature set. Phase 9 ([implementation/phases.md](../implementation/phases.md)) instead invests in reliability, semantic search quality, test depth, and a local inspection CLI — all strictly within aimem's existing project-scoped, single-user, zero-dependency identity.

**Reason:** ai-memory-mcp's feature set exists to solve a different problem — team/org-shared memory and multi-agent coordination at scale — which aimem's own PRD explicitly lists as v1 (and likely permanent) non-goals. Copying those features would not make aimem "more accurate or useful for everyone"; it would dilute the one differentiated claim the earlier build-vs-adopt research (ADR-001) found genuinely unfilled in the market: memory that lives inside the project folder itself, with zero setup and zero external dependencies. Chasing a differently-scoped competitor's feature count is a common trap that produces a worse, later-arriving version of someone else's product rather than a better version of your own. The one part of the comparison worth taking seriously — ai-memory-mcp's 2,400+ tests and ~92% coverage — is about engineering discipline, not scope, and is addressed directly in Phase 9C without any scope expansion.

**Consequences:** aimem's roadmap after Phase 8 branches from "feature-parity chase" toward "make the single project-scoped memory file bulletproof, fast, and inspectable." This preserves the project's original identity and the reasoning in ADR-001 through ADR-006, but means aimem will continue to look "smaller" than ai-memory-mcp on any feature-count comparison — an accepted trade-off, not an oversight. If real-world usage later surfaces a genuine, validated need for team-shared memory or multi-agent coordination, that requires its own discovery session and ADR, not a reflexive response to a competitor's comparison table.

---

## ADR-015: Six-Source Technical Research Sweep — Three Adoptions, Confirmed Architecture, Explicit Rejections

**Date:** 2026-08-06
**Status:** Accepted

**Decision:** Following a broader technical research pass (neo4j-contrib/mcp-neo4j, scanadi/mcp-ai-memory, rohitg00/agentmemory, a Mem0 status recheck, an architectural-patterns article, and a general 2026 embedded-vector-search/embedding-model sweep), three concrete, research-backed improvements were added to Phase 9: (1) evaluate `bge-small-en-v1.5` as a same-size, same-dimension (384) replacement for `all-MiniLM-L6-v2` (Phase 9B), (2) add hybrid keyword+vector re-ranking to `memory_search` using SQLite FTS5 already available with no new dependency (Phase 9E), (3) add explicit stale-fact invalidation as a small extension of the existing conflict/versioning engine, likely a third `memory_confirm_update` action value rather than a new tool (Phase 9F).

**Reason:** Every other researched project's distinguishing feature required infrastructure aimem deliberately doesn't run — Neo4j (no embedded mode exists), Postgres+pgvector+Redis (scanadi/mcp-ai-memory), a global `~/.agentmemory` store with Docker viewer (agentmemory), Qdrant+Postgres (Mem0, unchanged on recheck). None of these were adoptable without abandoning the project-folder-scoped, zero-dependency identity ADR-001 through ADR-006 already established. Separately, `sqlite-vec` was independently confirmed (2026 sources) as the current best embedded vector solution for this scale, validating aimem's existing choice rather than suggesting a replacement. Of five architectural memory patterns surveyed (ML Mastery), two were inapplicable to a single-user tool (context-window buffering is baseline hygiene already assumed; multi-tenant segregation is moot when there's one user), two represent genuine scope expansion into agent-action/workflow memory rather than fact memory (execution checkpointing, episodic event logs — deliberately deferred, not rejected outright, pending a real use case), and one (semantic memory with staleness handling) mapped directly onto an existing gap next to aimem's current conflict engine.

**Consequences:** Phase 9 grows by two subsections (9E, 9F) beyond the original four (9A–9D), all still inside the existing single-file, single-user, zero-dependency architecture — no new external dependency, no new runtime, no scope creep into multi-agent or multi-tenant territory. The embedding model swap (9B) is now a specific, falsifiable evaluation (benchmark `bge-small-en-v1.5` against the current baseline) rather than an open-ended "look for something better" task. MCP Sampling/Elicitation were confirmed deprecated as of the 2026-07-28 spec and are explicitly excluded from future consideration until/unless their replacement (MRTR-pattern) matures and proves relevant.

---

See also: [../RULES.md](../RULES.md), [../requirements/PRD.md](../requirements/PRD.md), [../architecture/system-overview.md](../architecture/system-overview.md), [implementation/phases.md](../implementation/phases.md) Phase 9.
