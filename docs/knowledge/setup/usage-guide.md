# aimem — Usage Guide

**Version:** v0.1.0
**Date:** 2026-08-06

This guide explains what actually happens once aimem is installed and registered (see [install-guide.md](install-guide.md)) — how memory gets created, how it's used across sessions, and what you can expect day to day. There is nothing to run manually; everything below happens through your normal AI chat.

## The core idea in one sentence

Your AI assistant automatically remembers important facts about each project — credentials, architecture decisions, bug fixes — in a small local file, and automatically recalls them the next time you open a chat, so you stop re-explaining the same things over and over.

## First time in a project

1. Open your project folder in Claude Code (or Cursor, Windsurf, etc.) and start a chat as normal.
2. Because there's no memory yet, the AI will tell you so — something like *"I don't have any memory for this project yet."* This is expected and correct; nothing is broken.
3. Just work normally. As you share things like credentials, architecture decisions, or bug fixes, the AI will automatically decide what's worth remembering and store it in the background — you don't need to do anything special.
4. Behind the scenes, this creates a `.aimem/` folder inside your project directory containing a single SQLite file (`memory.db`). It's automatically added to `.gitignore`, so it never gets committed — it stays local to your machine.

## Every session after that

1. Open a new chat in the same project.
2. The AI **always** checks for existing memory first and tells you what it found — e.g. *"I have memory for this project: 12 facts stored, last updated yesterday. Want me to load anything specific, or should I just continue?"*
3. Answer naturally — "yes, remind me what we decided about the database" or "just continue" or ignore it and ask your real question; the AI will pull in only what's relevant rather than dumping everything into the conversation.

This is the main thing aimem actually buys you: **you never have to paste your README, re-explain your architecture, or repeat "we use PostgreSQL, deploy via GitHub Actions, and staging is at X" again.**

## Explicitly asking it to remember something

Most of the time you don't need to do anything — the AI decides on its own what's worth storing. But if you want to force something into memory, just say so directly:

> "Remember this: never deploy on Fridays."
> "Remember that the staging password is now rotated — use the `STAGING_DB_PASS` env var."

This bypasses the AI's own judgment and stores it unconditionally.

## When information changes (conflicts)

If you tell the AI something that contradicts what's already stored — say you previously told it "we use MySQL" and now you say "we switched to PostgreSQL" — it won't silently overwrite the old fact. It will flag the conflict and ask you to confirm:

> "I previously had 'engine: MySQL' stored for primary-db, but you just said PostgreSQL. Should I update this?"

Confirming updates the value and keeps the old one in history (so "what did we use before Postgres?" is still answerable later). Rejecting leaves the original value untouched.

## Searching memory directly

You can also just ask the AI to look something up:

> "What do you remember about our auth setup?"
> "Do you have anything stored about the deploy process?"

The AI will search the project's memory and pull back only what's relevant, rather than needing you to remember exactly what was stored or when.

## What gets remembered vs. what doesn't

aimem is designed to store **meaningful, reusable project knowledge** — not your entire conversation:

**Typically stored:** credentials and environment details, architecture decisions ("we use Redis for session cache"), bug fixes and their causes, explicit "remember this" requests.

**Typically not stored:** small talk, one-off questions with no lasting relevance, anything you didn't ask it to remember and that isn't clearly a durable fact about the project.

If it ever misses something important, just tell it explicitly to remember it (see above).

## One memory store per project — never shared

Each project folder gets its own independent `.aimem/memory.db`. Memory from one project is never visible in another, even if you're working on both at once. If you move or rename a project folder, its memory moves with it (it's just a file sitting inside that folder).

## Multiple projects, one registration

If you registered aimem with **user scope** (`claude mcp add aimem-mcp npx aimem-mcp -s user` — see [install-guide.md](install-guide.md)), this all works automatically in every project you open, with nothing further to configure. If you registered with local/project scope, you'll need to repeat the registration command in each new project directory.

## Things to keep in mind

- **It relies on the AI's own judgment.** Automatic capture depends on the AI reliably deciding what's worth storing and reliably checking memory at the start of each session. This is generally good but not perfect — if it seems to have missed something, just tell it explicitly ("remember this").
- **Credentials are stored in plaintext**, in that local `.aimem/memory.db` file, same trust model as a local `.env` file. It's gitignored and never leaves your machine, but treat the file with the same care you'd give any file containing secrets.
- **No cross-project or team-shared memory in v1.** Each project is fully isolated, and there's no way (yet) to share memory across your team. This is intentional for v1 — see [../../requirements/PRD.md](../../requirements/PRD.md) for the roadmap.

See also: [install-guide.md](install-guide.md), [agent-instructions.md](agent-instructions.md) (if your agent keeps using its own memory instead of aimem's), [../error-handling.md](../error-handling.md), [../../workflows/](../../workflows/) for detailed step-by-step flow diagrams.
