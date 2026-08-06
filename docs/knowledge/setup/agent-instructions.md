# aimem — Making Your AI Agent Prefer aimem Over Its Own Built-In Memory

**Version:** v0.1.1
**Date:** 2026-08-06

## The problem this solves

Many AI coding agents (Claude Code included) have their own **built-in** memory/notes system, separate from any MCP server you connect. When you say "remember this" or "save all important information," the agent has to *choose* which memory system to use — and it may default to its own built-in one instead of aimem, even when aimem is connected and working correctly.

This is not a bug in aimem or a failure of the MCP connection — it's an inherent property of how AI agents pick which tool to call. aimem's own tool descriptions are written to say "prefer this" (see [api-design.md](../../architecture/api-design.md)), and this genuinely helps, but tool descriptions alone can't *force* an agent's choice. The single most reliable additional fix is a **project-level instruction file** telling your agent explicitly to prefer aimem for project-specific facts.

## The instruction to add

Add this to your project's instruction file (see the table below for which file, based on your agent):

```markdown
## Memory

This project uses the `aimem-mcp` MCP server for persistent, project-scoped memory.
When asked to remember, save, or note down information about this project — or when
you yourself decide something is worth remembering — always call aimem's memory tools
(`memory_remember`, `memory_store`, `memory_scan`) rather than relying solely on your
own built-in memory or notes system. At the start of every new session in this project,
call `memory_get_project_context` first, before anything else, to check for existing
memory. If you also maintain your own separate memory/notes, that's fine as an addition,
but aimem must always be included so future sessions in this project can find the
information via `memory_get_project_context` / `memory_search`.
```

## Where to put it, by agent

| Agent | File | Notes |
|---|---|---|
| **Claude Code** | `CLAUDE.md` (project root) | Read automatically; no config needed |
| **Cursor** | `.cursor/rules/aimem.mdc` (or legacy `.cursorrules`) | Modern format supports multiple scoped rule files |
| **Windsurf** | `.windsurf/rules/aimem.md` (or legacy `.windsurfrules`) | Modern format takes precedence if both exist |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Repo-wide; applies across Copilot Chat and PR review |
| **Cline** | `.clinerules` or `.clinerules/aimem.md` | Directory form supports multiple files |
| **Roo Code** | `.roo/rules/aimem.md` | Workspace-level; recursive |
| **OpenAI Codex CLI** | `AGENTS.md` (project root) | The convention Codex popularized |
| **Gemini CLI** | `GEMINI.md` (project root) | Hierarchical — also checks parent directories |

## The emerging universal standard: `AGENTS.md`

Most of the tools above — Codex, Cursor, Windsurf, Gemini CLI, GitHub Copilot, and others — have converged on reading a single `AGENTS.md` file at the project root as a shared, tool-agnostic convention (see [agents.md](https://agents.md)). **Claude Code is a partial exception**: it reads `CLAUDE.md` natively and does not pick up `AGENTS.md` automatically — you need to either duplicate the instruction into `CLAUDE.md` as well, or have `CLAUDE.md` import it:

```markdown
@AGENTS.md
```

**Recommended approach for maximum coverage with minimum duplication:** put the memory instruction above into a single `AGENTS.md` at your project root, then add a one-line `CLAUDE.md` that imports it:

```markdown
# CLAUDE.md
@AGENTS.md
```

This way, one instruction file covers Codex, Cursor, Windsurf, Gemini CLI, and Copilot directly, and Claude Code picks it up via the import.

## Why this can't be made fully automatic

This is a real, acknowledged limitation, not an oversight — see [../../requirements/PRD.md](../../requirements/PRD.md) Risks section. aimem is an MCP *tool*; it can never force an AI agent to call it. The agent always decides, per turn, which tool (if any) to use. Strong tool descriptions plus an explicit project instruction file are the two most effective levers available, but neither is a guarantee. If you notice a fact wasn't saved to aimem when it should have been, the reliable fallback is to just ask directly: *"use aimem's memory_remember tool to save that."*

See also: [install-guide.md](install-guide.md), [usage-guide.md](usage-guide.md), [../../requirements/PRD.md](../../requirements/PRD.md).
