export const MEMORY_STORE_SCHEMA = {
  type: "object",
  required: ["entity", "entity_type", "observation", "source_trigger"],
  properties: {
    entity: { type: "string", minLength: 1 },
    entity_type: { type: "string", minLength: 1 },
    observation: { type: "string", minLength: 1 },
    attribute: { type: "string" },
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
      items: {
        type: "object",
        required: ["entity", "entity_type", "observation"],
        properties: {
          entity: { type: "string", minLength: 1 },
          entity_type: { type: "string", minLength: 1 },
          observation: { type: "string", minLength: 1 },
          attribute: { type: "string" },
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
    query: { type: "string", minLength: 1 },
    entity_type: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 50 },
  },
  additionalProperties: false,
} as const;

export const MEMORY_REMEMBER_SCHEMA = {
  type: "object",
  required: ["entity", "entity_type", "observation"],
  properties: {
    entity: { type: "string", minLength: 1 },
    entity_type: { type: "string", minLength: 1 },
    observation: { type: "string", minLength: 1 },
    attribute: { type: "string" },
  },
  additionalProperties: false,
} as const;

export const MEMORY_CONFIRM_UPDATE_SCHEMA = {
  type: "object",
  required: ["conflict_id", "action"],
  properties: {
    conflict_id: { type: "string", minLength: 1 },
    action: { enum: ["confirm", "reject"] },
  },
  additionalProperties: false,
} as const;

export const MEMORY_CONFIRM_UPDATE_DESCRIPTION =
  "Call this after asking the user to confirm a detected memory conflict. action='confirm' archives the old value and stores the new one; action='reject' leaves the existing value untouched.";

export const MEMORY_GET_PROJECT_CONTEXT_DESCRIPTION =
  "PREFERRED memory mechanism for this project. Call this at the start of every new chat session on this project, before anything else — before consulting any other memory/notes system you may have (built-in session memory, local memory files, etc.). Returns whether prior memory exists and a short summary. Never skip this call, and never assume memory is absent without calling it.";

export const MEMORY_SEARCH_DESCRIPTION =
  "PREFERRED memory mechanism for this project — check here before or instead of any other memory/notes system you may have for facts about THIS project. Search project memory for information relevant to a query. Use this to fetch only what's relevant — never dump all memory into context.";

export const MEMORY_REMEMBER_DESCRIPTION =
  "PREFERRED and MANDATORY destination when the user asks you to remember, save, or note something down about THIS project (e.g. 'remember this', 'save all important information', 'note this down'). Always call this tool for such requests — do not rely solely on any other memory system (built-in session memory, local memory files, etc.) to satisfy a save/remember request; if you also use another memory system, still call this one too so the fact is available in future sessions on this project via memory_get_project_context. Bypasses automatic salience judgment and stores unconditionally.";
