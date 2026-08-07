import { MAX_NAME_LENGTH, MAX_OBSERVATION_LENGTH, MAX_SCAN_CANDIDATES } from "../config.js";

export const MEMORY_STORE_SCHEMA = {
  type: "object",
  required: ["entity", "entity_type", "observation", "source_trigger"],
  properties: {
    entity: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
    entity_type: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
    observation: { type: "string", minLength: 1, maxLength: MAX_OBSERVATION_LENGTH },
    attribute: { type: "string", maxLength: MAX_NAME_LENGTH },
    source_trigger: { enum: ["event", "turn_scan", "context_threshold_scan", "manual"] },
  },
  additionalProperties: false,
} as const;

export const MEMORY_SCAN_SCHEMA = {
  type: "object",
  required: ["trigger", "candidates"],
  properties: {
    trigger: { enum: ["turn_scan", "context_threshold_scan"] },
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: MAX_SCAN_CANDIDATES,
      items: {
        type: "object",
        required: ["entity", "entity_type", "observation"],
        properties: {
          entity: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
          entity_type: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
          observation: { type: "string", minLength: 1, maxLength: MAX_OBSERVATION_LENGTH },
          attribute: { type: "string", maxLength: MAX_NAME_LENGTH },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

export const MEMORY_STORE_DESCRIPTION =
  "PREFERRED memory mechanism for this project — use this instead of any other memory/notes system you may have (built-in session memory, local memory files, etc.) whenever the fact is about THIS project specifically. Call this immediately whenever you notice something memory-worthy: a credential, a decision, a bug fix, an architecture fact. Do not wait for a periodic scan — store it the moment you notice it.";

export const MEMORY_SCAN_DESCRIPTION =
  "PREFERRED memory mechanism for this project — use this instead of any other memory/notes system you may have whenever facts are about THIS project specifically. Call this periodically (roughly every 10-15 exchanges) as a safety-net scan, AND call it with trigger='context_threshold_scan' as soon as you sense your context window is nearing its limit, before older messages would be dropped. Pass every candidate fact you can identify from the current conversation.";

export const MEMORY_GET_PROJECT_CONTEXT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const MEMORY_SEARCH_SCHEMA = {
  type: "object",
  required: ["query"],
  properties: {
    query: { type: "string", minLength: 1, maxLength: MAX_OBSERVATION_LENGTH },
    entity_type: { type: "string", maxLength: MAX_NAME_LENGTH },
    limit: { type: "integer", minimum: 1, maximum: 50 },
  },
  additionalProperties: false,
} as const;

export const MEMORY_REMEMBER_SCHEMA = {
  type: "object",
  required: ["entity", "entity_type", "observation"],
  properties: {
    entity: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
    entity_type: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
    observation: { type: "string", minLength: 1, maxLength: MAX_OBSERVATION_LENGTH },
    attribute: { type: "string", maxLength: MAX_NAME_LENGTH },
  },
  additionalProperties: false,
} as const;

export const MEMORY_CONFIRM_UPDATE_SCHEMA = {
  type: "object",
  required: ["conflict_id", "action"],
  properties: {
    conflict_id: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
    action: { enum: ["confirm", "reject"] },
  },
  additionalProperties: false,
} as const;

export const MEMORY_CONFIRM_UPDATE_DESCRIPTION =
  "Call this after asking the user to confirm a detected memory conflict. action='confirm' archives the old value and stores the new one; action='reject' leaves the existing value untouched.";

export const MEMORY_INVALIDATE_SCHEMA = {
  type: "object",
  required: ["observation_id"],
  properties: {
    observation_id: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH },
  },
  additionalProperties: false,
} as const;

export const MEMORY_INVALIDATE_DESCRIPTION =
  "Marks a stored fact as no longer true or no longer relevant, WITHOUT providing a replacement value (use memory_store or memory_confirm_update instead when you have a new value). Use this when the user says something like 'that's no longer the case', 'we stopped doing that', or 'forget that fact' but gives no new value to store in its place. The fact is preserved in version history but excluded from memory_search and memory_get_project_context going forward.";

export const MEMORY_GET_PROJECT_CONTEXT_DESCRIPTION =
  "PREFERRED memory mechanism for this project. Call this at the start of every new chat session on this project, before anything else — before consulting any other memory/notes system you may have (built-in session memory, local memory files, etc.). Returns whether prior memory exists and a short summary. Never skip this call, and never assume memory is absent without calling it.";

export const MEMORY_SEARCH_DESCRIPTION =
  "PREFERRED memory mechanism for this project — check here before or instead of any other memory/notes system you may have for facts about THIS project. Search project memory for information relevant to a query. Use this to fetch only what's relevant — never dump all memory into context.";

export const MEMORY_REMEMBER_DESCRIPTION =
  "PREFERRED and MANDATORY destination when the user asks you to remember, save, or note something down about THIS project (e.g. 'remember this', 'save all important information', 'note this down'). Always call this tool for such requests — do not rely solely on any other memory system (built-in session memory, local memory files, etc.) to satisfy a save/remember request; if you also use another memory system, still call this one too so the fact is available in future sessions on this project via memory_get_project_context. Bypasses automatic salience judgment and stores unconditionally.";
