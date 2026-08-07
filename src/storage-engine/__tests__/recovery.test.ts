import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupBeforeRiskyWrite } from "../backup.js";
import { diagnoseCorruption, recoverFromBackup } from "../recovery.js";

describe("recovery", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-recovery-test-"));
    dbPath = join(dir, "memory.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("diagnoseCorruption", () => {
    it("reports no backup when none exists", () => {
      const diagnosis = diagnoseCorruption(dbPath);
      expect(diagnosis.backupExists).toBe(false);
      expect(diagnosis.backupPassesIntegrityCheck).toBeUndefined();
    });

    it("reports a valid backup that passes its own integrity check", () => {
      const db = new Database(dbPath);
      db.exec("CREATE TABLE t (id INTEGER)");
      db.close();
      backupBeforeRiskyWrite(dbPath);

      const diagnosis = diagnoseCorruption(dbPath);
      expect(diagnosis.backupExists).toBe(true);
      expect(diagnosis.backupPassesIntegrityCheck).toBe(true);
    });

    it("reports a backup that itself fails integrity check as unusable", () => {
      const db = new Database(dbPath);
      db.exec("CREATE TABLE t (id INTEGER)");
      db.close();
      backupBeforeRiskyWrite(dbPath);
      // Corrupt the backup itself (rare, but must be handled — a bad backup is not a safe restore target).
      writeFileSync(`${dbPath}.bak`, "not a valid sqlite file");

      const diagnosis = diagnoseCorruption(dbPath);
      expect(diagnosis.backupExists).toBe(true);
      expect(diagnosis.backupPassesIntegrityCheck).toBe(false);
    });
  });

  describe("recoverFromBackup", () => {
    it("restores a corrupted live file from a valid backup", () => {
      const db = new Database(dbPath);
      db.exec("CREATE TABLE t (id INTEGER)");
      db.exec("INSERT INTO t (id) VALUES (1)");
      db.close();
      backupBeforeRiskyWrite(dbPath);

      writeFileSync(dbPath, "corrupted garbage overwriting the real db");

      recoverFromBackup(dbPath);

      const restored = new Database(dbPath, { readonly: true });
      const row = restored.prepare("SELECT id FROM t").get() as { id: number };
      expect(row.id).toBe(1);
      restored.close();
    });
  });
});
