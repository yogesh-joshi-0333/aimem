#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AIMEM_DIR_NAME, MEMORY_DB_FILE_NAME } from "./config.js";
import { CaptureEngine } from "./capture-engine/capture-engine.js";
import type { CaptureCandidate } from "./capture-engine/types.js";
import { ConflictVersioningEngine } from "./conflict-versioning-engine/conflict-versioning-engine.js";
import type { ConfirmAction } from "./conflict-versioning-engine/types.js";
import { EmbeddingEngine } from "./embedding-search-engine/embedding-engine.js";
import { logger } from "./logger.js";
import { resolveProjectRoot } from "./mcp-server/resolve-project-root.js";
import {
  MEMORY_CONFIRM_UPDATE_DESCRIPTION,
  MEMORY_CONFIRM_UPDATE_SCHEMA,
  MEMORY_GET_PROJECT_CONTEXT_DESCRIPTION,
  MEMORY_GET_PROJECT_CONTEXT_SCHEMA,
  MEMORY_REMEMBER_DESCRIPTION,
  MEMORY_REMEMBER_SCHEMA,
  MEMORY_SCAN_DESCRIPTION,
  MEMORY_SCAN_SCHEMA,
  MEMORY_SEARCH_DESCRIPTION,
  MEMORY_SEARCH_SCHEMA,
  MEMORY_STORE_DESCRIPTION,
  MEMORY_STORE_SCHEMA,
} from "./mcp-server/tool-schemas.js";
import { ToolRouter } from "./mcp-server/tool-router.js";
import { RetrievalEngine } from "./retrieval-engine/retrieval-engine.js";
import type { SearchQueryInput } from "./retrieval-engine/types.js";
import { StorageEngine } from "./storage-engine/storage-engine.js";
import { ensureAimemGitignored } from "./storage-engine/ensure-gitignore.js";
import type { SourceTrigger } from "./storage-engine/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8")) as { version: string };
  return packageJson.version;
}

export interface ServerDependencies {
  readonly storage: StorageEngine;
  readonly embedder: EmbeddingEngine;
  readonly capture: CaptureEngine;
  readonly retrieval: RetrievalEngine;
  readonly conflicts: ConflictVersioningEngine;
}

function buildServerDependencies(projectRoot: string): ServerDependencies {
  ensureAimemGitignored(projectRoot);
  const dbPath = join(projectRoot, AIMEM_DIR_NAME, MEMORY_DB_FILE_NAME);
  const storage = new StorageEngine(dbPath);
  const embedder = new EmbeddingEngine();
  const conflicts = new ConflictVersioningEngine(storage);
  const capture = new CaptureEngine(storage, embedder, conflicts);
  const retrieval = new RetrievalEngine(storage, embedder);
  return { storage, embedder, capture, retrieval, conflicts };
}

/**
 * Lazily constructs ServerDependencies on first access rather than at server startup.
 *
 * This matters because opening the SQLite connection (inside StorageEngine's constructor)
 * throws StorageCorruptedError synchronously if .aimem/memory.db exists but is unreadable.
 * If dependencies were built eagerly at startServer() time, a corrupted file would crash
 * the whole process before the server ever finishes connecting — violating Rule 9 ("never
 * crash the host process on a handled error") and FR-ERR-02 (corrupted file must surface as
 * a normal per-call STORAGE_CORRUPTED response, not a fatal startup failure). Deferring
 * construction to the first tool call lets that error flow through ToolRouter's existing
 * try/catch classification instead.
 */
export class LazyServerDependencies {
  private cached: ServerDependencies | undefined;

  constructor(private readonly projectRoot: string) {}

  get(): ServerDependencies {
    if (this.cached === undefined) {
      this.cached = buildServerDependencies(this.projectRoot);
    }
    return this.cached;
  }
}

export function createToolRouter(deps: LazyServerDependencies): ToolRouter {
  const router = new ToolRouter();

  // The casts below are sound because ToolRouter.handleToolCall validates `input` against
  // each tool's declared JSON Schema (via ajv) before any handler runs — the shape is
  // guaranteed by the schema, not assumed here.
  router.registerTool(
    { name: "memory_store", description: MEMORY_STORE_DESCRIPTION, inputSchema: MEMORY_STORE_SCHEMA },
    async (input) => {
      const candidate = input as CaptureCandidate & { source_trigger: SourceTrigger };
      return deps.get().capture.store(candidate, candidate.source_trigger);
    },
  );

  router.registerTool(
    { name: "memory_scan", description: MEMORY_SCAN_DESCRIPTION, inputSchema: MEMORY_SCAN_SCHEMA },
    async (input) => {
      const { trigger, candidates } = input as {
        trigger: SourceTrigger;
        candidates: readonly CaptureCandidate[];
      };
      return deps.get().capture.scan(candidates, trigger);
    },
  );

  router.registerTool(
    {
      name: "memory_get_project_context",
      description: MEMORY_GET_PROJECT_CONTEXT_DESCRIPTION,
      inputSchema: MEMORY_GET_PROJECT_CONTEXT_SCHEMA,
    },
    async () => deps.get().retrieval.getProjectContext(),
  );

  router.registerTool(
    { name: "memory_search", description: MEMORY_SEARCH_DESCRIPTION, inputSchema: MEMORY_SEARCH_SCHEMA },
    async (input) => deps.get().retrieval.search(input as SearchQueryInput),
  );

  router.registerTool(
    { name: "memory_remember", description: MEMORY_REMEMBER_DESCRIPTION, inputSchema: MEMORY_REMEMBER_SCHEMA },
    async (input) => deps.get().capture.remember(input as CaptureCandidate),
  );

  router.registerTool(
    {
      name: "memory_confirm_update",
      description: MEMORY_CONFIRM_UPDATE_DESCRIPTION,
      inputSchema: MEMORY_CONFIRM_UPDATE_SCHEMA,
    },
    async (input) => {
      const { conflict_id, action } = input as { conflict_id: string; action: ConfirmAction };
      return deps.get().conflicts.confirmUpdate(conflict_id, action);
    },
  );

  return router;
}

export interface StartedServer {
  readonly server: Server;
  readonly projectRoot: string;
  readonly deps: LazyServerDependencies;
}

export async function startServer(explicitProjectRoot?: string): Promise<StartedServer> {
  const projectRoot = resolveProjectRoot(explicitProjectRoot);
  logger.info("aimem_starting");

  const deps = new LazyServerDependencies(projectRoot);
  const router = createToolRouter(deps);

  const server = new Server(
    { name: "aimem", version: readPackageVersion() },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: router.listTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.handleToolCall(request.params.name, request.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("aimem_started");

  return { server, projectRoot, deps };
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }
  // process.argv[1] is the literal path Node was invoked with (e.g. a symlink such as
  // npm's node_modules/.bin/aimem shim), while import.meta.url is resolved to the real
  // file path. Without realpathSync here, running via a global/npx bin symlink makes this
  // comparison always false, so startServer() silently never runs — found during Phase 8
  // npx packaging verification (the process started and exited cleanly with zero output).
  const resolvedInvokedPath = realpathSync(invokedPath);
  return import.meta.url === `file://${resolvedInvokedPath}`;
}

if (isMainModule()) {
  startServer(process.argv[2]).catch((err: unknown) => {
    logger.error("aimem_fatal_startup_error", {
      errName: err instanceof Error ? err.name : "UnknownError",
    });
    process.exitCode = 1;
  });
}
