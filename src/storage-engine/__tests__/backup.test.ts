import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupBeforeRiskyWrite, backupPath, hasBackup, restoreFromBackup } from "../backup.js";

describe("backup", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "aimem-backup-test-"));
    dbPath = join(dir, "memory.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("backupBeforeRiskyWrite", () => {
    it("does nothing if the db file doesn't exist yet", () => {
      backupBeforeRiskyWrite(dbPath);
      expect(hasBackup(dbPath)).toBe(false);
    });

    it("copies the db file to a .bak sibling", () => {
      writeFileSync(dbPath, "fake db contents v1");
      backupBeforeRiskyWrite(dbPath);
      expect(hasBackup(dbPath)).toBe(true);
      expect(readFileSync(backupPath(dbPath), "utf-8")).toBe("fake db contents v1");
    });

    it("overwrites a prior backup rather than keeping history", () => {
      writeFileSync(dbPath, "v1");
      backupBeforeRiskyWrite(dbPath);
      writeFileSync(dbPath, "v2");
      backupBeforeRiskyWrite(dbPath);
      expect(readFileSync(backupPath(dbPath), "utf-8")).toBe("v2");
    });
  });

  describe("restoreFromBackup", () => {
    it("throws if no backup exists", () => {
      expect(() => restoreFromBackup(dbPath)).toThrow(/No backup file exists/);
    });

    it("copies the backup back over the (possibly corrupted) live file", () => {
      writeFileSync(dbPath, "good contents");
      backupBeforeRiskyWrite(dbPath);
      writeFileSync(dbPath, "corrupted garbage");

      restoreFromBackup(dbPath);

      expect(readFileSync(dbPath, "utf-8")).toBe("good contents");
    });
  });
});
