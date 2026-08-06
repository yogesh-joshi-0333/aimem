# Workflow: Developer Active-Session Capture Flow

**Version:** v0.1.0-planning
**Date:** 2026-08-05

## Overview

This workflow covers the capture half of the MVP loop: how memory-worthy information gets stored automatically (or manually) *during* an active conversation, via the three-tier trigger model — event-based, turn-count-based, and context-threshold-based — plus the explicit "remember this" override.

## First-Time Setup Flow

No separate setup is required beyond the one-time install/registration in [developer-new-session-flow.md](developer-new-session-flow.md) — capture behavior is driven entirely by the tool descriptions the AI reads when it lists available tools, per [modules/capture-engine.md](../modules/capture-engine.md).

## Daily / Normal Use Flow

```
1. Conversation proceeds normally between developer and AI
2. EVENT TRIGGER: the moment the AI recognizes something memory-worthy
   (a credential, a decision, a bug fix) it calls memory_store immediately,
   without waiting for a periodic checkpoint
3. TURN-COUNT TRIGGER: roughly every 10-15 exchanges, the AI performs a
   quick memory_scan safety-net pass over anything the event trigger missed
4. CONTEXT-THRESHOLD TRIGGER: as the AI senses its own context window
   nearing capacity, it performs a thorough final memory_scan
   (trigger: "context_threshold_scan") BEFORE older messages get evicted
5. MANUAL OVERRIDE: at any point, the developer can say "remember this" —
   the AI calls memory_remember unconditionally, bypassing salience judgment
6. If any capture attempt detects a conflict with existing memory, the AI
   surfaces it to the developer for confirmation (see
   workflows/conflict-resolution-flow.md) rather than storing silently
```

## Concrete Example Task Walkthrough

**Scenario:** Mid-conversation, the developer shares a new staging credential, then later explicitly asks the AI to remember a policy decision.

Example tool calls:

```
Developer: "The new staging DB password is stored in the STAGING_DB_PASS env var now."

[AI recognizes this as memory-worthy immediately — event trigger]
→ call_tool: memory_store
  input: { "entity": "staging-db", "entity_type": "credential",
           "attribute": "password_location",
           "observation": "Staging DB password is provided via STAGING_DB_PASS env var",
           "source_trigger": "event" }
← { "success": true, "data": { "id": "a1b2...", "created_at": "2026-08-05T14:00:00.000Z",
      "conflict_detected": false } }

[... 12 exchanges later, turn-count trigger fires ...]
→ call_tool: memory_scan
  input: { "trigger": "turn_scan", "candidates": [
      { "entity": "deploy-pipeline", "entity_type": "decision",
        "observation": "CI now runs lint before tests, added this session" } ] }
← { "success": true, "data": { "stored": ["c3d4..."], "skipped_duplicates": [], "conflicts": [] } }

Developer: "Remember this: never deploy on Fridays."

→ call_tool: memory_remember
  input: { "entity": "deploy-process", "entity_type": "decision",
           "observation": "Team policy: never deploy on Fridays" }
← { "success": true, "data": { "id": "e5f6...", "created_at": "2026-08-05T14:20:00.000Z",
      "source_trigger": "manual", "conflict_detected": false } }
```

## Troubleshooting Flow

```
Symptom: A fact you mentioned clearly was never stored
  → Ask the AI directly to "remember this" (manual override) as a fallback
  → This may be an instance of the documented instruction-following
    reliability risk (see requirements/PRD.md Risks) — note the occurrence
    for the owner's daily self-test log per implementation/estimation.md

Symptom: memory_scan keeps re-storing the same fact as a new entry
  → Check the dedup logic in modules/capture-engine.md — this indicates a
    bug in duplicate detection, not expected behavior; file it as a Phase 4
    follow-up task in implementation/phases.md

Symptom: Capture feels slow / adds noticeable latency to the conversation
  → This is the documented secondary risk (scan overhead vs. tokens saved)
    in requirements/PRD.md — note frequency/latency for real-world
    validation in Phase 8
```

See also: [../architecture/data-flow.md](../architecture/data-flow.md) (sequences 2 and 3), [../modules/capture-engine.md](../modules/capture-engine.md).
