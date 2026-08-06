# aimem — Install Guide

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | `20.11.0` (LTS) | Required runtime; check with `node -v` |
| npm | `10.0.0` | Bundled with Node 20 LTS; check with `npm -v` |
| OS | macOS, Linux, or Windows 10+ | Prebuilt native module binaries targeted for all three |
| Disk space | ~150 MB free | Covers the bundled ONNX embedding model plus dependencies |

## Install Steps

1. Confirm Node.js version: `node -v` (must be `20.11.0` or higher, below `21`).
2. Install aimem globally: `npm install -g aimem-mcp` (the npm package is named `aimem-mcp`; the installed CLI command is `aimem`).
   - Alternatively, run without installing: `npx aimem-mcp` (downloads and runs on demand, per npx's normal caching behavior; the embedding model itself is still bundled in the package, not downloaded separately at runtime).
3. Register aimem as an MCP server in your AI client's MCP configuration, pointing the command at the installed binary (e.g. `aimem` if globally installed, or `npx aimem-mcp` otherwise). Consult your specific client's MCP server configuration documentation for the exact config file location.
4. Open your project folder in your AI client and start a new chat — aimem automatically creates `.aimem/` inside that project folder on first use.

## Configuration

v1 requires minimal configuration:

| Setting | Default | How to override |
|---|---|---|
| Project root | Current working directory the server is launched from | Pass an explicit path via the client's MCP server `args` configuration if your client launches the server from a different directory |
| Turn-count scan interval | Embedded in the `memory_scan` tool description (default guidance: every 10–15 exchanges) | Not user-configurable in v1; a future version may expose this |

No environment variables are required for normal operation. No API keys are required at any point.

## Verification Steps

1. After registering aimem in your AI client, start a new chat in a test project folder.
2. Confirm the AI announces whether project memory exists (should say "no memory yet" on a fresh project).
3. Ask the AI to remember something explicit (e.g. "remember that this project uses PostgreSQL").
4. Check that `<project_root>/.aimem/memory.db` now exists: `ls -la .aimem/`
5. Confirm `.aimem/` was added to `.gitignore`: `cat .gitignore | grep aimem`
6. Start a brand-new chat session in the same project and confirm the AI announces that memory exists this time.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `npm install -g aimem-mcp` fails during native module build | Missing build tools for `better-sqlite3` native compilation | Install platform build tools (Xcode Command Line Tools on macOS, `build-essential` on Linux, Visual Studio Build Tools on Windows), then retry |
| AI client shows no aimem tools available, or the connection immediately closes with no logged output at all | **Most common real-world cause, confirmed during Phase 8 testing:** Node.js was installed via a version manager (`nvm`, `fnm`, `volta`, etc.), so `node` only exists on `PATH` inside your interactive shell — not in the minimal environment most MCP clients use to spawn subprocesses. The `aimem` binary's `#!/usr/bin/env node` shebang line then fails silently (`env: 'node': No such file or directory`), and the AI client just sees the connection close with no error text. **Fix:** in your MCP client's server config, point `command` at the *absolute path* to `node` (find it with `which node`, e.g. `/home/you/.nvm/versions/node/v20.20.2/bin/node`) with `args: ["/absolute/path/to/aimem-mcp/dist/server.js"]` (or the global-install equivalent, `which aimem` then resolve the symlink target), instead of relying on a bare `aimem` or `npx aimem-mcp` command string. |
| AI client shows no aimem tools available (Node installed via an OS package manager, not a version manager) | MCP server not registered correctly, or wrong command path | Verify the client's MCP config points to the correct `aimem` binary path (`which aimem`); restart the client |
| `.aimem/memory.db` never appears | Server not actually being invoked, or project root resolved incorrectly | Confirm the client launches the server with CWD set to the project root; check client logs for spawn errors |
| AI never announces memory on new sessions | Client not following the `memory_get_project_context` tool instruction reliably | This is the documented instruction-following risk (see [../../requirements/PRD.md](../../requirements/PRD.md) Risks); try explicitly asking "do you have memory for this project?" as a manual check |
| "Storage corrupted" error appears | `.aimem/memory.db` file damaged (e.g. disk error, manual edit, interrupted write) | Back up the existing `.aimem/memory.db` file before doing anything else, then report the issue; do not delete it without a backup |
| Slow first tool call | Embedding model loading into memory on first use (lazy-loaded, not first-run download) | Expected one-time per-process warm-up; subsequent calls in the same server process are fast |

See also: [current-project-state.md](current-project-state.md), [../error-handling.md](../error-handling.md).
