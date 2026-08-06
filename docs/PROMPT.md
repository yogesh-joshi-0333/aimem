# aimem — PROMPT.md

**Version:** v0.1.0-planning
**Date:** 2026-08-05

Reusable prompts for starting or resuming agent work sessions on the **aimem** project.

## General "Start Any Session" Prompt

```
You are working on "aimem" — a local-first, project-scoped MCP memory server
(Node.js/TypeScript) that gives AI coding assistants persistent memory across
chat sessions, stored inside each project's own .aimem/ folder (SQLite +
sqlite-vec + local embeddings, zero external dependencies).

All project documentation lives in /var/www/html/AImem/aimem/docs/ (docs tree).
All project source code lives in /var/www/html/AImem/aimem/src/
(code tree) — these two trees are kept separate; do not mix them.
The project root contains only README.md, source code, and config/build files.

Before writing any code, read these 8 files IN THIS EXACT ORDER:
1. RULES.md
2. AGENT-LOG.md
3. knowledge/setup/current-project-state.md
4. requirements/PRD.md
5. requirements/functional-requirements.md
6. architecture/system-overview.md + architecture/api-design.md
7. implementation/phases.md
8. the relevant file in modules/ for the component you are about to touch

After reading, report back:
- The current phase (per implementation/phases.md and AGENT-LOG.md)
- The next unchecked task in that phase
- Which files you intend to create/modify to complete it

Then update AGENT-LOG.md, setting that task's row to Status = "In Progress"
with today's date in "Started" — BEFORE writing any code.

Only then begin implementation, following RULES.md without exception.
```

## Phase-Specific Prompts

```
Phase 1 — "Work on Phase 1 of aimem: project scaffold + MCP server skeleton."
Phase 2 — "Work on Phase 2 of aimem: SQLite storage engine + entity/relation schema."
Phase 3 — "Work on Phase 3 of aimem: sqlite-vec + local embedding model integration."
Phase 4 — "Work on Phase 4 of aimem: automatic capture tools (three-tier trigger model)."
Phase 5 — "Work on Phase 5 of aimem: new-session pickup + manual override tool."
Phase 6 — "Work on Phase 6 of aimem: conflict detection + versioned history."
Phase 7 — "Work on Phase 7 of aimem: error handling for missing/corrupted files + concurrency verification."
Phase 8 — "Work on Phase 8 of aimem: packaging, npm publish, cross-client testing, real-world validation."
```

Each phase-specific prompt should still be followed by the same 8-file reading order and AGENT-LOG.md update step from the general prompt above.

## "Continue From Current Phase" Prompt

```
Read AGENT-LOG.md and implementation/phases.md to determine the current
phase and the next unchecked task. Follow the standard 8-file reading order
in PROMPT.md before touching code. Update AGENT-LOG.md to "In Progress"
before starting. Do not skip ahead to a later phase while the current phase
has unchecked boxes (RULES.md Rule 10).
```

## "Review and Fix" Prompt

```
Review the most recently completed task(s) in AGENT-LOG.md against their
phase's completion criteria in implementation/phases.md. Check:
- Tests exist and pass (RULES.md Rule 6)
- No mocking of storage/network layers in tests
- Docs updated per the Rule 7 sync table in RULES.md
- No scope creep beyond the current phase's tasks (RULES.md Rule 11)
Fix any gaps found. Update AGENT-LOG.md and phases.md checkboxes to reflect
the true state after your review.
```

## Important Notes

- **Code location vs. docs location**: All documentation stays in the `aimem/docs/` tree described in README.md's Quick Links table. All source code lives under `aimem/src/`, structured per [knowledge/coding-standards.md](knowledge/coding-standards.md), with one directory per module matching the files in `modules/`. Never place source code files inside `docs/requirements/`, `docs/architecture/`, `docs/knowledge/`, `docs/modules/`, `docs/workflows/`, or `docs/decisions/`.
- **Never modify docs except AGENT-LOG.md and phases.md**: Once a doc file is written, agents must not silently edit requirements, architecture, or knowledge docs while implementing code. The only files an agent updates routinely during implementation are `AGENT-LOG.md` (task status) and `implementation/phases.md` (checking off completed tasks). Any other doc change requires an explicit instruction from the project owner and, if it reflects a new architectural decision, a new entry in `decisions/ADR.md`.
