# aimem — Install Guide

**Version:** v0.1.0
**Date:** 2026-08-06

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | `20.11.0` (LTS) | Required runtime; check with `node -v` |
| npm | `10.0.0` | Bundled with Node 20 LTS; check with `npm -v` |
| OS | macOS, Linux, or Windows 10+ | Prebuilt native module binaries targeted for all three |
| Disk space | ~150 MB free | Covers the bundled ONNX embedding model plus dependencies |

## Step 1 — Install

```bash
npm install -g aimem-mcp
```

The published npm package is named `aimem-mcp`; the command it installs is `aimem`. Verify it installed correctly:

```bash
aimem --version 2>/dev/null; which aimem
```

You don't need to run `aimem` directly — your AI client (Claude Code, Cursor, etc.) launches it automatically once registered in Step 2. There is nothing to start manually and nothing that stays running in the background between sessions.

## Step 2 — Register it with your AI client

### Claude Code

```bash
claude mcp add aimem-mcp npx aimem-mcp
```

This registers aimem so Claude Code can spawn it on demand. By default this registers it with **local scope** — available only in the directory you ran the command from. Two other scopes matter:

| Scope | Command | Available in |
|---|---|---|
| `local` (default) | `claude mcp add aimem-mcp npx aimem-mcp` | Only the current project directory |
| `user` | `claude mcp add aimem-mcp npx aimem-mcp -s user` | **Every project you open**, on this machine, without repeating the command |
| `project` | `claude mcp add aimem-mcp npx aimem-mcp -s project` | Only this project, but shared with anyone else who clones it and has the same config committed |

**Most people want `user` scope** — register it once, and it's available in every project you open afterward, with no per-project setup:

```bash
claude mcp add aimem-mcp npx aimem-mcp -s user
```

Verify it's registered:

```bash
claude mcp list
```

You should see `aimem-mcp` listed with a `✓ Connected` status once you open a chat.

### Cursor / Windsurf / Claude Desktop / any other MCP client

Add this to the client's MCP server configuration (consult your client's docs for the exact config file location):

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

### If your Node.js was installed via a version manager (nvm, fnm, volta)

**This is the single most common install problem.** MCP clients often spawn subprocesses with a minimal environment that doesn't include the `PATH` your interactive shell sets up — so a bare `npx aimem-mcp` command may silently fail to find `node`. If tools don't appear after registering, use absolute paths instead:

```bash
which node       # e.g. /home/you/.nvm/versions/node/v20.20.2/bin/node
which npx         # e.g. /home/you/.nvm/versions/node/v20.20.2/bin/npx
```

Then register with the absolute path:

```bash
claude mcp add aimem-mcp /home/you/.nvm/versions/node/v20.20.2/bin/npx aimem-mcp -s user
```

Or in a JSON config:

```json
{
  "mcpServers": {
    "aimem-mcp": {
      "command": "/home/you/.nvm/versions/node/v20.20.2/bin/npx",
      "args": ["aimem-mcp"]
    }
  }
}
```

## Step 3 — Use it

Nothing else to configure. Open any project in your AI client and start a new chat — see [usage-guide.md](usage-guide.md) for what happens next and how to use it day to day.

## Verification Steps

1. After registering aimem (Step 2), open a chat in a project folder.
2. Ask your AI to list its available tools — you should see `memory_store`, `memory_scan`, `memory_get_project_context`, `memory_search`, `memory_remember`, `memory_confirm_update`.
3. Ask the AI to remember something explicit (e.g. "remember that this project uses PostgreSQL").
4. Confirm `<project_root>/.aimem/memory.db` now exists: `ls -la .aimem/`
5. Confirm `.aimem/` was added to `.gitignore` automatically: `cat .gitignore | grep aimem`
6. Start a brand-new chat session in the same project and confirm the AI announces that memory exists this time, without you having to re-explain anything.

## Configuration

v1 requires minimal configuration:

| Setting | Default | How to override |
|---|---|---|
| Project root | Current working directory the server is launched from | Pass an explicit path via the client's MCP server `args` configuration if your client launches the server from a different directory |
| Turn-count scan interval | Embedded in the `memory_scan` tool description (default guidance: every 10–15 exchanges) | Not user-configurable in v1; a future version may expose this |

No environment variables are required for normal operation. No API keys are required at any point.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `npm install -g aimem-mcp` fails during native module build | Missing build tools for `better-sqlite3` native compilation | Install platform build tools (Xcode Command Line Tools on macOS, `build-essential` on Linux, Visual Studio Build Tools on Windows), then retry |
| Registered aimem, but no tools appear / connection closes with no output | **Most common real-world cause:** Node.js installed via a version manager (nvm/fnm/volta) — `node`/`npx` aren't on the `PATH` the MCP client uses to spawn subprocesses. See "If your Node.js was installed via a version manager" above. |
| Tools appear in one project but not another | You registered with `local` (or `project`) scope, which only applies to the directory you ran the command from | Re-register with `-s user` to make it available everywhere, or repeat the `local` registration in each project directory |
| `.aimem/memory.db` never appears | Server not actually being invoked, or project root resolved incorrectly | Confirm the client launches the server with CWD set to the project root; check client logs for spawn errors |
| AI never announces memory on new sessions | Client not following the `memory_get_project_context` tool instruction reliably | This is a documented instruction-following risk (see [../../requirements/PRD.md](../../requirements/PRD.md) Risks) — try explicitly asking "do you have memory for this project?" as a manual check |
| "Storage corrupted" error appears | `.aimem/memory.db` file damaged (e.g. disk error, manual edit, interrupted write) | Back up the existing `.aimem/memory.db` file before doing anything else, then report the issue; do not delete it without a backup |
| Slow first tool call | Local embedding model loading into memory on first use (lazy-loaded per server process, not a network download) | Expected one-time per-process warm-up; subsequent calls in the same session are fast |
| You manually ran `npx aimem-mcp` in a terminal and it just sits there | This is expected — aimem is an MCP *server*, not a CLI tool you run directly. It's waiting for an MCP client to connect over stdio. Press Ctrl+C to stop it; register it via Step 2 instead and let your AI client launch it automatically. |

See also: [usage-guide.md](usage-guide.md), [agent-instructions.md](agent-instructions.md) (if your agent keeps using its own memory instead of aimem's), [current-project-state.md](current-project-state.md), [../error-handling.md](../error-handling.md).
