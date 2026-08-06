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
  "Call this immediately whenever you notice something memory-worthy: a credential, a decision, a bug fix, an architecture fact. Do not wait for a periodic scan — store it the moment you notice it.";

export const MEMORY_SCAN_DESCRIPTION =
  "Call this periodically (roughly every 10-15 exchanges) as a safety-net scan, AND call it with trigger='context_threshold_scan' as soon as you sense your context window is nearing its limit, before older messages would be dropped. Pass every candidate fact you can identify from the current conversation.";

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
  "Call this at the start of every new chat session on this project, before anything else. Returns whether prior memory exists and a short summary. Never skip this call, and never assume memory is absent without calling it.";

export const MEMORY_SEARCH_DESCRIPTION =
  "Search project memory for information relevant to a query. Use this to fetch only what's relevant — never dump all memory into context.";

export const MEMORY_REMEMBER_DESCRIPTION =
  "Call this when the user explicitly asks you to remember something (e.g. 'remember this', 'note this down'). Bypasses automatic salience judgment and stores unconditionally.";
