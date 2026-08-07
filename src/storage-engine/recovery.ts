import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { backupPath, hasBackup, restoreFromBackup } from "./backup.js";

export interface CorruptionDiagnosis {
  readonly dbPath: string;
  readonly backupExists: boolean;
  readonly backupPath: string;
  readonly backupPassesIntegrityCheck: boolean | undefined; // undefined if no backup exists
}

/**
 * Diagnoses a corrupted memory.db and reports whether a rolling backup
 * exists and is itself readable. Does NOT attempt in-place SQLite repair —
 * better-sqlite3 has no equivalent to the sqlite3 CLI's `.recover` dot
 * command, and shelling out to a system `sqlite3` binary would be an
 * undocumented external dependency this project deliberately avoids (see
 * docs/RULES.md Rule 11). Restoring from the rolling backup, with explicit
 * user confirmation, is the only recovery path — see the `aimem inspect
 * repair` CLI command (Phase 9D) for the confirmation flow.
 */
export function diagnoseCorruption(dbPath: string): CorruptionDiagnosis {
  const backup = backupPath(dbPath);
  const backupExists = hasBackup(dbPath);

  let backupPassesIntegrityCheck: boolean | undefined;
  if (backupExists) {
    backupPassesIntegrityCheck = checkIntegrity(backup);
  }

  return { dbPath, backupExists, backupPath: backup, backupPassesIntegrityCheck };
}

function checkIntegrity(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  let db: Database.Database;
  try {
    db = new Database(path, { readonly: true });
  } catch {
    return false;
  }
  try {
    const result = db.pragma("integrity_check") as ReadonlyArray<{ integrity_check: string }>;
    return result[0]?.integrity_check === "ok";
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/**
 * Restores memory.db from its rolling backup. Caller (the `aimem inspect
 * repair` CLI, Phase 9D) is responsible for obtaining explicit user
 * confirmation before calling this — it performs the restore unconditionally
 * once invoked, matching backupBeforeRiskyWrite's file-copy semantics.
 */
export function recoverFromBackup(dbPath: string): void {
  restoreFromBackup(dbPath);
}
