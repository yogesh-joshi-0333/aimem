import { copyFileSync, existsSync } from "node:fs";

const BACKUP_SUFFIX = ".bak";

export function backupPath(dbPath: string): string {
  return `${dbPath}${BACKUP_SUFFIX}`;
}

/**
 * Copies the current memory.db to a single rolling backup file
 * (memory.db.bak), overwriting any prior backup. Not a versioned backup
 * history — deliberately simple, see docs/implementation/phases.md Phase 9A.
 * No-ops silently if dbPath doesn't exist yet (nothing to back up).
 */
export function backupBeforeRiskyWrite(dbPath: string): void {
  if (!existsSync(dbPath)) {
    return;
  }
  copyFileSync(dbPath, backupPath(dbPath));
}

export function hasBackup(dbPath: string): boolean {
  return existsSync(backupPath(dbPath));
}

export function restoreFromBackup(dbPath: string): void {
  const backup = backupPath(dbPath);
  if (!existsSync(backup)) {
    throw new Error(`No backup file exists at ${backup}`);
  }
  copyFileSync(backup, dbPath);
}
