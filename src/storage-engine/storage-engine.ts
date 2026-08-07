import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerVecExtension } from "../embedding-search-engine/vector-index.js";
import { backupBeforeRiskyWrite } from "./backup.js";
import { StorageCorruptedError } from "./errors.js";
import type {
  ConflictRecord,
  CreateEntityInput,
  CreateObservationInput,
  CreateRelationInput,
  EntityRecord,
  ObservationRecord,
  ObservationVersionRecord,
  RelationRecord,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");
const MIGRATION_FILES = [
  "001-init-schema.sql",
  "002-conflict-versioning.sql",
  "003-vector-index.sql",
  "004-fts-search.sql",
];

function nowIso(): string {
  return new Date().toISOString();
}

export class StorageEngine {
  private readonly db: Database.Database;

  constructor(private readonly dbPath: string) {
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true, mode: 0o700 });
    }

    const isFreshFile = !existsSync(dbPath);

    let db: Database.Database;
    try {
      db = new Database(dbPath);
    } catch {
      throw new StorageCorruptedError(dbPath);
    }
    this.db = db;

    try {
      this.db.pragma("journal_mode = WAL");

      if (!isFreshFile) {
        const result = this.db.pragma("integrity_check") as ReadonlyArray<{ integrity_check: string }>;
        if (result[0]?.integrity_check !== "ok") {
          throw new StorageCorruptedError(dbPath);
        }
      }
    } catch (err) {
      this.db.close();
      if (err instanceof StorageCorruptedError) {
        throw err;
      }
      throw new StorageCorruptedError(dbPath);
    }

    if (!isFreshFile) {
      backupBeforeRiskyWrite(dbPath);
    }
    this.runMigrations();
    this.backfillFtsIndexIfNeeded();
    registerVecExtension(this.db);

    try {
      chmodSync(dbPath, 0o600);
      chmodSync(dbDir, 0o700);
    } catch {
      // Non-POSIX filesystems (e.g. some Windows configurations) may not support chmod; not fatal.
    }
  }

  getRawConnection(): Database.Database {
    return this.db;
  }

  /**
   * Copies the current memory.db to a single rolling backup (memory.db.bak)
   * before a risky write (e.g. a confirmed conflict update). See
   * docs/implementation/phases.md Phase 9A. Cheap enough to call before any
   * write that isn't on the memory_store/memory_scan hot path.
   */
  backupNow(): void {
    backupBeforeRiskyWrite(this.dbPath);
  }

  private runMigrations(): void {
    for (const fileName of MIGRATION_FILES) {
      const sql = readFileSync(join(MIGRATIONS_DIR, fileName), "utf-8");
      this.db.exec(sql);
    }
  }

  /**
   * Populates observations_fts for any observations rows that predate the
   * FTS5 migration (004-fts-search.sql) being added to an existing memory.db.
   * Only fires when the FTS index is empty but observations has rows — a
   * fresh db has nothing to backfill, and an already-backfilled db must not
   * re-run this (rebuilding a large FTS index on every single startup would
   * be a real performance regression at the thousands-of-entries scale this
   * project targets, see FR-STORE-07). Must use FTS5's special 'rebuild'
   * command as a literal VALUES(...) — a conditional SELECT-based INSERT
   * does not populate an external-content FTS5 index correctly (verified
   * empirically; see 004-fts-search.sql's comment for detail).
   */
  private backfillFtsIndexIfNeeded(): void {
    const ftsRow = this.db.prepare(`SELECT 1 as present FROM observations_fts LIMIT 1`).get() as
      | { present: number }
      | undefined;
    if (ftsRow !== undefined) {
      return;
    }
    const obsRow = this.db.prepare(`SELECT 1 as present FROM observations LIMIT 1`).get() as
      | { present: number }
      | undefined;
    if (obsRow === undefined) {
      return;
    }
    this.db.exec(`INSERT INTO observations_fts(observations_fts) VALUES ('rebuild')`);
  }

  createEntity(input: CreateEntityInput): EntityRecord {
    const existing = this.getEntityByName(input.name, input.entity_type);
    if (existing !== undefined) {
      return existing;
    }
    const id = randomUUID();
    const ts = nowIso();
    this.db
      .prepare(
        `INSERT INTO entities (id, name, entity_type, created_at, updated_at)
         VALUES (@id, @name, @entity_type, @created_at, @updated_at)`,
      )
      .run({ id, name: input.name, entity_type: input.entity_type, created_at: ts, updated_at: ts });
    return { id, name: input.name, entity_type: input.entity_type, created_at: ts, updated_at: ts };
  }

  getEntityByName(name: string, entityType: string): EntityRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM entities WHERE name = @name AND entity_type = @entity_type`)
      .get({ name, entity_type: entityType }) as EntityRecord | undefined;
    return row;
  }

  getEntityById(id: string): EntityRecord | undefined {
    return this.db.prepare(`SELECT * FROM entities WHERE id = @id`).get({ id }) as EntityRecord | undefined;
  }

  listEntities(filter?: { readonly entity_type?: string }): readonly EntityRecord[] {
    if (filter?.entity_type !== undefined) {
      return this.db
        .prepare(`SELECT * FROM entities WHERE entity_type = @entity_type ORDER BY created_at DESC`)
        .all({ entity_type: filter.entity_type }) as EntityRecord[];
    }
    return this.db.prepare(`SELECT * FROM entities ORDER BY created_at DESC`).all() as EntityRecord[];
  }

  countEntities(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM entities`).get() as { count: number };
    return row.count;
  }

  getLastUpdatedAt(): string | undefined {
    const row = this.db
      .prepare(`SELECT MAX(updated_at) as last_updated_at FROM observations`)
      .get() as { last_updated_at: string | null };
    return row.last_updated_at ?? undefined;
  }

  getTopEntitiesByRecentActivity(limit: number): readonly string[] {
    // Ties on updated_at (same-millisecond writes) break deterministically by insertion
    // order (rowid) rather than arbitrary SQLite ordering.
    const rows = this.db
      .prepare(
        `SELECT e.name as name, MAX(o.updated_at) as last_activity, MAX(o.rowid) as last_rowid
         FROM entities e
         JOIN observations o ON o.entity_id = e.id
         GROUP BY e.id
         ORDER BY last_activity DESC, last_rowid DESC
         LIMIT @limit`,
      )
      .all({ limit }) as ReadonlyArray<{ name: string; last_activity: string; last_rowid: number }>;
    return rows.map((row) => row.name);
  }

  createRelation(input: CreateRelationInput): RelationRecord {
    const id = randomUUID();
    const created_at = nowIso();
    this.db
      .prepare(
        `INSERT INTO relations (id, from_entity_id, to_entity_id, relation_type, created_at)
         VALUES (@id, @from_entity_id, @to_entity_id, @relation_type, @created_at)`,
      )
      .run({ id, ...input, created_at });
    return { id, ...input, created_at };
  }

  getRelationsByEntity(entityId: string): readonly RelationRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM relations WHERE from_entity_id = @entity_id OR to_entity_id = @entity_id ORDER BY created_at DESC`,
      )
      .all({ entity_id: entityId }) as RelationRecord[];
  }

  createObservation(input: CreateObservationInput): ObservationRecord {
    const id = randomUUID();
    const ts = nowIso();
    const record: ObservationRecord = {
      id,
      entity_id: input.entity_id,
      attribute: input.attribute ?? null,
      observation: input.observation,
      confidence: input.confidence ?? 1.0,
      source_trigger: input.source_trigger,
      version: 1,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO observations
           (id, entity_id, attribute, observation, confidence, source_trigger, version, created_at, updated_at)
         VALUES
           (@id, @entity_id, @attribute, @observation, @confidence, @source_trigger, @version, @created_at, @updated_at)`,
      )
      .run(record);
    return record;
  }

  getObservationById(id: string): ObservationRecord | undefined {
    return this.db.prepare(`SELECT * FROM observations WHERE id = @id`).get({ id }) as ObservationRecord | undefined;
  }

  getObservationsByEntity(entityId: string): readonly ObservationRecord[] {
    return this.db
      .prepare(`SELECT * FROM observations WHERE entity_id = @entity_id ORDER BY created_at DESC`)
      .all({ entity_id: entityId }) as ObservationRecord[];
  }

  findLatestObservation(entityId: string, attribute: string): ObservationRecord | undefined {
    return this.db
      .prepare(
        `SELECT * FROM observations
         WHERE entity_id = @entity_id AND attribute = @attribute
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get({ entity_id: entityId, attribute }) as ObservationRecord | undefined;
  }

  updateObservationValue(observationId: string, newValue: string, newVersion: number): void {
    const ts = nowIso();
    this.db
      .prepare(
        `UPDATE observations SET observation = @observation, version = @version, updated_at = @updated_at
         WHERE id = @id`,
      )
      .run({ id: observationId, observation: newValue, version: newVersion, updated_at: ts });
  }

  archiveVersion(observationId: string, oldValue: string, oldVersion: number, newVersion: number): ObservationVersionRecord {
    const id = randomUUID();
    const superseded_at = nowIso();
    const record: ObservationVersionRecord = {
      id,
      observation_id: observationId,
      version: oldVersion,
      value: oldValue,
      superseded_at,
      superseded_by_version: newVersion,
    };
    this.db
      .prepare(
        `INSERT INTO observation_versions
           (id, observation_id, version, value, superseded_at, superseded_by_version)
         VALUES
           (@id, @observation_id, @version, @value, @superseded_at, @superseded_by_version)`,
      )
      .run(record);
    return record;
  }

  getVersionHistory(observationId: string): readonly ObservationVersionRecord[] {
    return this.db
      .prepare(`SELECT * FROM observation_versions WHERE observation_id = @observation_id ORDER BY version DESC`)
      .all({ observation_id: observationId }) as ObservationVersionRecord[];
  }

  createConflict(observationId: string, existingValue: string, newValue: string): ConflictRecord {
    const id = randomUUID();
    const created_at = nowIso();
    const record: ConflictRecord = {
      id,
      observation_id: observationId,
      existing_value: existingValue,
      new_value: newValue,
      status: "pending",
      created_at,
      resolved_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO conflicts
           (id, observation_id, existing_value, new_value, status, created_at, resolved_at)
         VALUES
           (@id, @observation_id, @existing_value, @new_value, @status, @created_at, @resolved_at)`,
      )
      .run(record);
    return record;
  }

  getConflictById(id: string): ConflictRecord | undefined {
    return this.db.prepare(`SELECT * FROM conflicts WHERE id = @id`).get({ id }) as ConflictRecord | undefined;
  }

  resolveConflict(id: string, status: "confirmed" | "rejected"): void {
    const resolved_at = nowIso();
    this.db
      .prepare(`UPDATE conflicts SET status = @status, resolved_at = @resolved_at WHERE id = @id`)
      .run({ id, status, resolved_at });
  }

  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.pragma("wal_checkpoint(TRUNCATE)");
    this.db.close();
  }
}
