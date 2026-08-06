# Workflow: Conflict Resolution Flow

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Overview

This workflow covers what happens when newly captured information contradicts something already stored in memory (e.g. the database engine changing from MySQL to PostgreSQL). aimem never silently overwrites and never silently discards the new information — it flags the conflict and requires explicit developer confirmation, then preserves the old value as archived history.

## First-Time Setup Flow

No separate setup required — conflict detection is a built-in behavior of every capture path (`memory_store`, `memory_scan`, `memory_remember`), per [modules/conflict-versioning-engine.md](../modules/conflict-versioning-engine.md). Nothing needs to be enabled.

## Daily / Normal Use Flow

```
1. A capture tool call (memory_store / memory_scan / memory_remember)
   attempts to write a new value for an entity+attribute pair
2. The Conflict & Versioning Engine compares it against the latest
   stored value for that same entity+attribute
3. If the values differ meaningfully:
   a. The write is NOT performed
   b. A row is inserted into the conflicts table with status "pending"
   c. The tool response includes conflict_detected: true, conflict_id,
      existing_value, and new_value
4. The AI surfaces this to the developer in plain language and asks
   for confirmation
5. Developer confirms or rejects
6. AI calls memory_confirm_update with the conflict_id and the chosen action
   a. "confirm" → old value archived into observation_versions (version+1),
      live value updated to the new value
   b. "reject" → live value stays exactly as it was, conflict marked resolved
      with no changes made
```

## Concrete Example Task Walkthrough

**Scenario:** The project's primary database engine changes mid-conversation.

```
Developer: "We're moving off MySQL — the primary DB is PostgreSQL now."

→ call_tool: memory_store
  input: { "entity": "primary-db", "entity_type": "architecture_fact",
           "attribute": "engine", "observation": "PostgreSQL",
           "source_trigger": "event" }
← { "success": true, "data": { "conflict_detected": true, "conflict_id": "c-9a2f...",
      "existing_value": "MySQL", "new_value": "PostgreSQL" } }

AI: "I have the primary DB engine currently recorded as MySQL — you're telling me
     it's now PostgreSQL. Should I update this? The old value will be kept in
     history, not deleted."

Developer: "Yes, update it."

→ call_tool: memory_confirm_update
  input: { "conflict_id": "c-9a2f...", "action": "confirm" }
← { "success": true, "data": { "updated": true, "new_version": 2 } }

AI: "Done — primary DB engine is now recorded as PostgreSQL (version 2).
     The prior MySQL entry is preserved in history."
```

**Rejection variant:**

```
Developer: "Actually no, don't change that — that note was about a different project."

→ call_tool: memory_confirm_update
  input: { "conflict_id": "c-9a2f...", "action": "reject" }
← { "success": true, "data": { "updated": false } }
```

## Troubleshooting Flow

```
Symptom: memory_confirm_update returns CONFLICT_NOT_FOUND
  → The conflict_id may have already been resolved in a prior turn or a
    different session — ask the AI to re-check via memory_search whether
    the value already reflects the intended state

Symptom: AI updates a value without asking for confirmation
  → This is a bug, not expected behavior — conflict detection must always
    block the write per modules/conflict-versioning-engine.md; file as a
    Phase 6 defect against implementation/phases.md

Symptom: You want to see the full history of a changed value
  → Not exposed via any v1 tool (no browsing UI is in scope per
    requirements/PRD.md Non-Goals) — the data exists in
    observation_versions and is queryable directly against memory.db
    with a SQLite client if needed for manual inspection
```

See also: [../architecture/data-flow.md](../architecture/data-flow.md) (sequence 4), [../modules/conflict-versioning-engine.md](../modules/conflict-versioning-engine.md), [../decisions/ADR.md](../decisions/ADR.md) (ADR-006).
