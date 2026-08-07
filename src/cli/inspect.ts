#!/usr/bin/env node
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { AIMEM_DIR_NAME, MEMORY_DB_FILE_NAME } from "../config.js";
import { resolveProjectRoot } from "../mcp-server/resolve-project-root.js";
import { StorageEngine } from "../storage-engine/storage-engine.js";
import { StorageCorruptedError } from "../storage-engine/errors.js";
import { diagnoseCorruption, recoverFromBackup } from "../storage-engine/recovery.js";
import { EmbeddingEngine } from "../embedding-search-engine/embedding-engine.js";
import { RetrievalEngine } from "../retrieval-engine/retrieval-engine.js";

function dbPathFor(projectRoot: string): string {
  return join(projectRoot, AIMEM_DIR_NAME, MEMORY_DB_FILE_NAME);
}

export interface InspectListResult {
  readonly entities: ReadonlyArray<{
    readonly name: string;
    readonly entity_type: string;
    readonly observations: ReadonlyArray<{
      readonly attribute: string | null;
      readonly observation: string;
      readonly confidence: number;
      readonly version: number;
      readonly updated_at: string;
    }>;
  }>;
}

/**
 * Read-only listing of every entity and its live (non-invalidated)
 * observations. Reuses StorageEngine directly -- no MCP protocol involved,
 * this is a human-facing local utility, not a tool exposed to AI clients.
 */
export function runList(storage: StorageEngine): InspectListResult {
  const entities = storage.listEntities().map((entity) => ({
    name: entity.name,
    entity_type: entity.entity_type,
    observations: storage.getObservationsByEntity(entity.id).map((obs) => ({
      attribute: obs.attribute,
      observation: obs.observation,
      confidence: obs.confidence,
      version: obs.version,
      updated_at: obs.updated_at,
    })),
  }));
  return { entities };
}

export interface InspectSearchResult {
  readonly results: ReadonlyArray<{
    readonly entity: string;
    readonly entity_type: string;
    readonly observation: string;
    readonly confidence: number;
    readonly created_at: string;
  }>;
}

/** Runs the same hybrid search memory_search uses, callable without an MCP client. */
export async function runSearch(
  storage: StorageEngine,
  embedder: EmbeddingEngine,
  query: string,
  limit: number,
): Promise<InspectSearchResult> {
  const retrieval = new RetrievalEngine(storage, embedder);
  const { results } = await retrieval.search({ query, limit });
  return { results };
}

export interface InspectExportResult {
  readonly exported_at: string;
  readonly entities: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly entity_type: string;
    readonly created_at: string;
    readonly updated_at: string;
  }>;
  readonly observations: ReadonlyArray<{
    readonly id: string;
    readonly entity_id: string;
    readonly attribute: string | null;
    readonly observation: string;
    readonly confidence: number;
    readonly source_trigger: string;
    readonly version: number;
    readonly created_at: string;
    readonly updated_at: string;
    readonly invalidated_at: string | null;
  }>;
}

/** Dumps the full live entity/observation graph to a JSON-serializable object, for backup/migration. */
export function runExport(storage: StorageEngine): InspectExportResult {
  const entities = storage.listEntities();
  const observations = entities.flatMap((entity) => storage.getAllObservationsByEntity(entity.id));
  return {
    exported_at: new Date().toISOString(),
    entities: entities.map((e) => ({ ...e })),
    observations: observations.map((o) => ({ ...o })),
  };
}

export interface InspectRepairResult {
  readonly repaired: boolean;
  readonly reason?: string;
}

/**
 * Restores memory.db from its rolling .bak backup (Phase 9A), with explicit
 * confirmation required -- this is exactly the human-judgment confirmation
 * flow deferred from Phase 9A/9E (see ADR-018), since deciding to discard
 * the current (corrupted) file and overwrite it with the backup is a
 * destructive, human-judgment operation, not something an AI agent should
 * decide on the user's behalf via an MCP tool call.
 */
export function runRepair(dbPath: string, confirmed: boolean): InspectRepairResult {
  const diagnosis = diagnoseCorruption(dbPath);
  if (!diagnosis.backupExists) {
    return { repaired: false, reason: "no backup file exists at " + diagnosis.backupPath };
  }
  if (diagnosis.backupPassesIntegrityCheck !== true) {
    return { repaired: false, reason: "the backup file itself fails its own integrity check" };
  }
  if (!confirmed) {
    return { repaired: false, reason: "not confirmed — re-run with --yes to actually restore from backup" };
  }
  recoverFromBackup(dbPath);
  return { repaired: true };
}

function printUsage(): void {
  process.stdout.write(
    [
      "Usage: aimem-inspect <command> [options]",
      "",
      "Commands:",
      "  list              List all entities and their observations",
      "  search <query>    Search memory (same hybrid search memory_search uses)",
      "  export            Dump the full entity/observation graph as JSON",
      "  repair [--yes]    Diagnose corruption and restore from backup (requires --yes to apply)",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const projectRoot = resolveProjectRoot();
  const dbPath = dbPathFor(projectRoot);

  if (command === undefined || command === "--help" || command === "-h") {
    printUsage();
    process.exitCode = command === undefined ? 1 : 0;
    return;
  }

  if (command === "repair") {
    const confirmed = rest.includes("--yes");
    const result = runRepair(dbPath, confirmed);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.repaired ? 0 : 1;
    return;
  }

  if (!existsSync(dbPath)) {
    process.stdout.write(`No memory found for this project yet (${dbPath} does not exist).\n`);
    return;
  }

  let storage: StorageEngine;
  try {
    storage = new StorageEngine(dbPath);
  } catch (err) {
    if (err instanceof StorageCorruptedError) {
      process.stderr.write(
        `${dbPath} exists but failed its integrity check. Run "aimem-inspect repair" to check for a usable backup.\n`,
      );
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  try {
    if (command === "list") {
      process.stdout.write(`${JSON.stringify(runList(storage), null, 2)}\n`);
      return;
    }

    if (command === "search") {
      const query = rest.join(" ").trim();
      if (query.length === 0) {
        process.stderr.write("aimem-inspect search requires a query, e.g. aimem-inspect search \"staging db\"\n");
        process.exitCode = 1;
        return;
      }
      const embedder = new EmbeddingEngine();
      process.stdout.write(`${JSON.stringify(await runSearch(storage, embedder, query, 10), null, 2)}\n`);
      return;
    }

    if (command === "export") {
      process.stdout.write(`${JSON.stringify(runExport(storage), null, 2)}\n`);
      return;
    }

    printUsage();
    process.exitCode = 1;
  } finally {
    storage.close();
  }
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }
  // Same symlink caveat as src/server.ts's isMainModule (ADR-010): process.argv[1] is the
  // literal invoked path (e.g. npm's node_modules/.bin/aimem-inspect shim), while
  // import.meta.url resolves to the real file. Without realpathSync, invoking via a
  // global/npx bin symlink would make this comparison always false.
  const resolvedInvokedPath = realpathSync(invokedPath);
  return import.meta.url === `file://${resolvedInvokedPath}`;
}

if (isMainModule()) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
