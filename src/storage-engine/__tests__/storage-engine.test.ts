import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageEngine } from "../storage-engine.js";
import { StorageCorruptedError } from "../errors.js";
import { hasBackup } from "../backup.js";

describe("StorageEngine", () => {
  let dir: string;
  let dbPath: string;
  let engine: StorageEngine;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-test-"));
    dbPath = join(dir, "memory.db");
    engine = new StorageEngine(dbPath);
  });

  afterEach(() => {
    engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates .aimem/memory.db with WAL mode enabled", () => {
    expect(statSync(dbPath).isFile()).toBe(true);
  });

  it("sets restrictive file/directory permissions on POSIX", () => {
    if (process.platform === "win32") {
      return;
    }
    const fileMode = statSync(dbPath).mode & 0o777;
    const dirMode = statSync(dir).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(dirMode).toBe(0o700);
  });

  describe("entities", () => {
    it("creates and retrieves an entity by name and type", () => {
      const created = engine.createEntity({ name: "staging-db", entity_type: "credential" });
      const found = engine.getEntityByName("staging-db", "credential");
      expect(found?.id).toBe(created.id);
      expect(found?.entity_type).toBe("credential");
    });

    it("is idempotent: creating the same name+type twice returns the same entity", () => {
      const first = engine.createEntity({ name: "staging-db", entity_type: "credential" });
      const second = engine.createEntity({ name: "staging-db", entity_type: "credential" });
      expect(second.id).toBe(first.id);
    });

    it("lists entities filtered by entity_type", () => {
      engine.createEntity({ name: "staging-db", entity_type: "credential" });
      engine.createEntity({ name: "auth-service", entity_type: "decision" });
      const credentials = engine.listEntities({ entity_type: "credential" });
      expect(credentials).toHaveLength(1);
      expect(credentials[0]?.name).toBe("staging-db");
    });

    it("lists all entities when no filter is given", () => {
      engine.createEntity({ name: "staging-db", entity_type: "credential" });
      engine.createEntity({ name: "auth-service", entity_type: "decision" });
      expect(engine.listEntities()).toHaveLength(2);
    });

    it("counts entities", () => {
      engine.createEntity({ name: "a", entity_type: "decision" });
      engine.createEntity({ name: "b", entity_type: "decision" });
      expect(engine.countEntities()).toBe(2);
    });
  });

  describe("observations", () => {
    it("creates and retrieves observations by entity", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "PostgreSQL",
        source_trigger: "event",
      });
      const observations = engine.getObservationsByEntity(entity.id);
      expect(observations).toHaveLength(1);
      expect(observations[0]?.observation).toBe("PostgreSQL");
      expect(observations[0]?.version).toBe(1);
    });

    it("finds the latest observation for an entity+attribute", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      const latest = engine.findLatestObservation(entity.id, "engine");
      expect(latest?.observation).toBe("MySQL");
    });

    it("updates an observation value and increments version", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      engine.updateObservationValue(obs.id, "PostgreSQL", 2);
      const updated = engine.getObservationById(obs.id);
      expect(updated?.observation).toBe("PostgreSQL");
      expect(updated?.version).toBe(2);
    });

    it("creates a new observation with invalidated_at unset (Phase 9F)", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "PostgreSQL",
        source_trigger: "event",
      });
      expect(obs.invalidated_at).toBeNull();
      expect(engine.getObservationById(obs.id)?.invalidated_at).toBeNull();
    });

    it("invalidateObservation sets invalidated_at and returns the timestamp (Phase 9F)", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });

      const returned = engine.invalidateObservation(obs.id);
      const stored = engine.getObservationById(obs.id);
      expect(stored?.invalidated_at).toBe(returned);
      expect(stored?.observation).toBe("MySQL");
    });

    it("excludes invalidated observations from getObservationsByEntity and findLatestObservation (Phase 9F)", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      engine.invalidateObservation(obs.id);

      expect(engine.getObservationsByEntity(entity.id)).toHaveLength(0);
      expect(engine.findLatestObservation(entity.id, "engine")).toBeUndefined();
      expect(engine.getObservationById(obs.id)).toBeDefined();
    });

    it("getAllObservationsByEntity includes invalidated observations (Phase 9D)", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      engine.invalidateObservation(obs.id);

      expect(engine.getAllObservationsByEntity(entity.id)).toHaveLength(1);
    });
  });

  describe("relations", () => {
    it("creates and retrieves relations by entity", () => {
      const a = engine.createEntity({ name: "auth-service", entity_type: "decision" });
      const b = engine.createEntity({ name: "redis", entity_type: "decision" });
      engine.createRelation({ from_entity_id: a.id, to_entity_id: b.id, relation_type: "depends_on" });
      const relations = engine.getRelationsByEntity(a.id);
      expect(relations).toHaveLength(1);
      expect(relations[0]?.relation_type).toBe("depends_on");
    });
  });

  describe("versioning", () => {
    it("archives an old value and links it to the superseding version", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      engine.archiveVersion(obs.id, "MySQL", 1, 2);
      engine.updateObservationValue(obs.id, "PostgreSQL", 2);

      const history = engine.getVersionHistory(obs.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.value).toBe("MySQL");
      expect(history[0]?.superseded_by_version).toBe(2);
    });
  });

  describe("conflicts", () => {
    it("creates a pending conflict and resolves it", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      const obs = engine.createObservation({
        entity_id: entity.id,
        attribute: "engine",
        observation: "MySQL",
        source_trigger: "event",
      });
      const conflict = engine.createConflict(obs.id, "MySQL", "PostgreSQL");
      expect(conflict.status).toBe("pending");

      engine.resolveConflict(conflict.id, "confirmed");
      const resolved = engine.getConflictById(conflict.id);
      expect(resolved?.status).toBe("confirmed");
      expect(resolved?.resolved_at).not.toBeNull();
    });
  });

  describe("transactions", () => {
    it("rolls back all writes if any step throws inside runInTransaction", () => {
      const entity = engine.createEntity({ name: "tx-entity", entity_type: "decision" });
      expect(() => {
        engine.runInTransaction(() => {
          engine.createObservation({
            entity_id: entity.id,
            observation: "will be rolled back",
            source_trigger: "event",
          });
          throw new Error("simulated failure mid-transaction");
        });
      }).toThrow("simulated failure mid-transaction");

      expect(engine.getObservationsByEntity(entity.id)).toHaveLength(0);
    });
  });

  describe("backups (Phase 9A)", () => {
    it("does not back up on first creation of a fresh db (nothing to back up yet)", () => {
      // `engine` from beforeEach is a first-open on a brand-new file.
      expect(hasBackup(dbPath)).toBe(false);
    });

    it("backs up the existing file before running migrations on a second open", () => {
      engine.close();
      engine = new StorageEngine(dbPath);
      expect(hasBackup(dbPath)).toBe(true);
    });

    it("backupNow() copies the current file to memory.db.bak", () => {
      engine.createEntity({ name: "test", entity_type: "decision" });
      expect(hasBackup(dbPath)).toBe(false);
      engine.backupNow();
      expect(hasBackup(dbPath)).toBe(true);
    });
  });

  describe("FTS5 backfill gating (Phase 9E)", () => {
    it("does not re-run the FTS5 rebuild on a second open once the index is already populated", () => {
      const entity = engine.createEntity({ name: "primary-db", entity_type: "architecture_fact" });
      engine.createObservation({ entity_id: entity.id, observation: "PostgreSQL is the primary engine", source_trigger: "event" });

      engine.close();
      expect(() => {
        engine = new StorageEngine(dbPath);
      }).not.toThrow();

      const stillThere = engine.getObservationsByEntity(entity.id);
      expect(stillThere).toHaveLength(1);
    });
  });

  describe("invalidated_at column migration (Phase 9F)", () => {
    it("does not throw 'duplicate column name' when reopening a db that already has the column", () => {
      // `engine` from beforeEach already ran addInvalidatedAtColumnIfNeeded() once
      // on this file. Reopening must be a no-op, not a second unguarded ALTER TABLE.
      engine.close();
      expect(() => {
        engine = new StorageEngine(dbPath);
      }).not.toThrow();
    });
  });
});

describe("StorageEngine — corrupted file handling", () => {
  it("throws StorageCorruptedError when the db file exists but is not a valid SQLite file", () => {
    const dir = mkdtempSync(join(tmpdir(), "aimem-test-corrupt-"));
    const dbPath = join(dir, "memory.db");
    writeFileSync(dbPath, "this is not a valid sqlite database file, just plain garbage bytes");

    expect(() => new StorageEngine(dbPath)).toThrow(StorageCorruptedError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws StorageCorruptedError when the file opens successfully but fails PRAGMA integrity_check", () => {
    // Unlike the garbage-bytes case above (which fails at the driver's new Database() call),
    // this exercises the separate integrity_check branch: a file with a structurally valid
    // SQLite header that still opens, but whose page data is corrupted deep inside.
    const dir = mkdtempSync(join(tmpdir(), "aimem-test-corrupt-page-"));
    const dbPath = join(dir, "memory.db");

    const seed = new Database(dbPath);
    seed.pragma("journal_mode = DELETE");
    seed.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    for (let i = 0; i < 200; i += 1) {
      seed.exec(`INSERT INTO t (v) VALUES ('data${i}')`);
    }
    seed.close();

    const buf = readFileSync(dbPath);
    const offset = buf.length - 50;
    buf[offset] = (buf[offset] ?? 0) ^ 0xff;
    writeFileSync(dbPath, buf);

    expect(() => new StorageEngine(dbPath)).toThrow(StorageCorruptedError);

    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the parent directory if it does not yet exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "aimem-test-mkdir-"));
    const nestedDir = join(dir, "does-not-exist-yet");
    const dbPath = join(nestedDir, "memory.db");

    const engine = new StorageEngine(dbPath);
    expect(statSync(nestedDir).isDirectory()).toBe(true);
    engine.close();

    rmSync(dir, { recursive: true, force: true });
  });
});
