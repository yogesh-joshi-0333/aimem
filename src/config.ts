export const AIMEM_DIR_NAME = ".aimem";
export const MEMORY_DB_FILE_NAME = "memory.db";
export const DEFAULT_LOG_LEVEL = "info";
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;
export const EMBEDDING_MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_MODEL_DIR_NAME = "models";

// Input-size ceilings enforced via JSON Schema on every tool that accepts free text (Phase 9,
// post-launch hardening pass). Names/attributes are short identifiers; observation text is a
// single fact/note, not a document. These exist to keep a single memory_store/memory_scan call
// bounded in cost, not to be a "correct" universal limit -- generous enough that no legitimate
// use case should ever hit them.
export const MAX_NAME_LENGTH = 256;
export const MAX_OBSERVATION_LENGTH = 8000;
export const MAX_SCAN_CANDIDATES = 100;
