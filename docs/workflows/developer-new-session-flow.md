# Workflow: Developer New-Session Flow

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Overview

This workflow covers what happens when the project owner opens a new chat session in an AI client on a project that already has (or might have) aimem memory. The goal is the retrieval half of the MVP loop: the AI must always announce memory status and let the user drive what gets pulled into context, never dumping everything and never staying silent.

## First-Time Setup Flow

```
1. Install aimem globally (see knowledge/setup/install-guide.md)
2. Register aimem as an MCP server in the AI client's config
3. Open the target project folder in the AI client
4. Start a new chat
   └─► AI calls memory_get_project_context automatically
       └─► has_memory: false (nothing stored yet)
       └─► AI proceeds with a normal conversation;
           .aimem/ is created lazily on the first memory_store/
           memory_remember call, not on this initial check
```

## Daily / Normal Use Flow

```
1. Developer opens an existing project with .aimem/memory.db already populated
2. Developer starts a new chat session
3. AI calls memory_get_project_context (ALWAYS, no conditional skip)
4. Response: has_memory: true, summary: { entity_count, last_updated_at, top_entities }
5. AI announces: "This project has memory (42 entries, last updated Aug 4).
   Where would you like to pick up, or what would you like me to recall?"
6. Developer answers, e.g. "what did we decide about the auth service?"
7. AI calls memory_search({ query: "auth service decisions" })
8. AI incorporates only the relevant returned results into context
9. Conversation proceeds with full prior context, no manual re-explanation needed
```

## Concrete Example Task Walkthrough

**Scenario:** Developer returns to the "aimem" project itself after a week away, opens a new chat, and wants to continue implementation work.

Example tool calls:

```
→ call_tool: memory_get_project_context
  input: {}
← { "success": true, "data": { "has_memory": true,
      "summary": { "entity_count": 18, "last_updated_at": "2026-07-29T09:15:00.000Z",
                    "top_entities": ["storage-engine", "phase-2-plan", "sqlite-vec-decision"] } } }

AI: "This project has memory — 18 entries, last updated July 29. Want me to pick up
     where we left off on Phase 2, or is there something specific you want to check first?"

Developer: "Remind me what we decided about the schema for observations."

→ call_tool: memory_search
  input: { "query": "observations table schema decision", "limit": 5 }
← { "success": true, "data": { "results": [
      { "entity": "storage-engine", "attribute": "observations_schema",
        "observation": "observations table includes attribute, confidence, source_trigger, version columns",
        "confidence": 0.91, "created_at": "2026-07-29T09:10:00.000Z" } ] } }

AI: "You decided the observations table needs attribute, confidence, source_trigger,
     and version columns. Want to continue from there?"
```

## Troubleshooting Flow

```
Symptom: AI never mentions memory at session start
  → Check: is aimem actually registered as an MCP server for this client? (verify tool list)
  → Check: does .aimem/memory.db exist in this exact project folder?
  → This may be the documented instruction-following reliability risk —
    try explicitly asking "check project memory" as a manual fallback

Symptom: AI says "no memory" but you know memory exists
  → Check for a STORAGE_CORRUPTED error in the client's tool-call output
  → If found: back up .aimem/memory.db immediately, do not delete it,
    report per knowledge/error-handling.md guidance

Symptom: memory_search returns nothing relevant
  → Try a broader or differently-phrased query
  → Confirm the fact was actually captured (see
    workflows/developer-active-session-capture-flow.md troubleshooting)
```

See also: [../architecture/data-flow.md](../architecture/data-flow.md) (sequence 1), [../modules/retrieval-engine.md](../modules/retrieval-engine.md).
