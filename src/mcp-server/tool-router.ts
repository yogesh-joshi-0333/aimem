import { Ajv } from "ajv";
import type { ValidateFunction } from "ajv";
import { logger } from "../logger.js";
import { StorageCorruptedError } from "../storage-engine/errors.js";
import { InvalidInputError } from "../capture-engine/errors.js";
import { ConflictNotFoundError, ObservationNotFoundError } from "../conflict-versioning-engine/errors.js";
import { EmbeddingModelUnavailableError } from "../embedding-search-engine/errors.js";

export interface ToolSuccessResponse {
  readonly success: true;
  readonly data: unknown;
}

export interface ToolErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type ToolResponse = ToolSuccessResponse | ToolErrorResponse;

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export type ToolHandler = (input: unknown) => Promise<unknown>;

const INVALID_INPUT_ERROR: ToolErrorResponse = {
  success: false,
  error: {
    code: "INVALID_INPUT",
    message: "The input provided to this tool is invalid or incomplete. Please check the required fields and try again.",
  },
};

const STORAGE_CORRUPTED_ERROR: ToolErrorResponse = {
  success: false,
  error: {
    code: "STORAGE_CORRUPTED",
    message:
      "Your project memory file (.aimem/memory.db) exists but could not be read. It may be corrupted. No data has been modified or deleted — please back up .aimem/memory.db and report this issue before continuing.",
  },
};

const CONFLICT_NOT_FOUND_ERROR: ToolErrorResponse = {
  success: false,
  error: {
    code: "CONFLICT_NOT_FOUND",
    message: "No pending memory conflict was found with the given conflict_id. It may have already been resolved.",
  },
};

const OBSERVATION_NOT_FOUND_ERROR: ToolErrorResponse = {
  success: false,
  error: {
    code: "OBSERVATION_NOT_FOUND",
    message: "No observation was found with the given observation_id, or it has already been invalidated.",
  },
};

const INTERNAL_ERROR: ToolErrorResponse = {
  success: false,
  error: {
    code: "INTERNAL_ERROR",
    message: "An unexpected internal error occurred in aimem. Your existing memory data has not been modified.",
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });

export class ToolRouter {
  private readonly tools = new Map<
    string,
    { definition: ToolDefinition; handler: ToolHandler; validate: ValidateFunction }
  >();

  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    const validate = ajv.compile(definition.inputSchema);
    this.tools.set(definition.name, { definition, handler, validate });
  }

  listTools(): readonly ToolDefinition[] {
    return Array.from(this.tools.values(), (entry) => entry.definition);
  }

  async handleToolCall(toolName: string, input: unknown): Promise<ToolResponse> {
    const entry = this.tools.get(toolName);
    if (entry === undefined) {
      return INVALID_INPUT_ERROR;
    }

    if (!entry.validate(input)) {
      return INVALID_INPUT_ERROR;
    }

    try {
      const data = await entry.handler(input);
      return { success: true, data };
    } catch (err) {
      if (err instanceof StorageCorruptedError) {
        return STORAGE_CORRUPTED_ERROR;
      }
      if (err instanceof InvalidInputError) {
        return INVALID_INPUT_ERROR;
      }
      if (err instanceof ConflictNotFoundError) {
        return CONFLICT_NOT_FOUND_ERROR;
      }
      if (err instanceof ObservationNotFoundError) {
        return OBSERVATION_NOT_FOUND_ERROR;
      }
      // EmbeddingModelUnavailableError and any other unclassified error both map to the
      // same fixed INTERNAL_ERROR text — explicit branch kept separate from the generic
      // catch-all so this mapping is guaranteed by design, not an accident of fallthrough
      // (its constructor message may include the underlying loader's raw text, which must
      // never reach the wire — see FR-ERR-04).
      if (err instanceof EmbeddingModelUnavailableError) {
        logger.error("embedding_model_unavailable", { tool: toolName });
        return INTERNAL_ERROR;
      }
      logger.error("unhandled_tool_error", {
        tool: toolName,
        errName: err instanceof Error ? err.name : "UnknownError",
      });
      return INTERNAL_ERROR;
    }
  }
}
