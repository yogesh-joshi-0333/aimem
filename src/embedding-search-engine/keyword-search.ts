import type Database from "better-sqlite3";
import type { KeywordSearchResult } from "./types.js";

/**
 * FTS5 keyword search over observations_fts (see
 * src/storage-engine/migrations/004-fts-search.sql). Sanitizes the raw query
 * for FTS5's MATCH syntax by quoting each token individually and joining
 * with OR — treats the query as a bag of words rather than requiring FTS5
 * query-syntax literacy from callers (a raw natural-language query containing
 * characters like `-` or `"` would otherwise throw a syntax error from FTS5).
 */
export function searchKeyword(db: Database.Database, queryText: string, limit: number): readonly KeywordSearchResult[] {
  const tokens = queryText
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return [];
  }

  const ftsQuery = tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(" OR ");

  // Excludes invalidated observations (Phase 9F) directly in SQL via the JOIN, not as a
  // post-filter in JS -- unlike sqlite-vec's k-nearest-neighbor cutoff (see vector-index.ts),
  // FTS5's plain ORDER BY + LIMIT composes safely with a WHERE filter applied first.
  const rows = db
    .prepare(
      `SELECT f.rowid as observation_rowid, f.rank as rank
       FROM observations_fts f
       JOIN observations o ON o.rowid = f.rowid
       WHERE f.observations_fts MATCH ? AND o.invalidated_at IS NULL
       ORDER BY f.rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as ReadonlyArray<{ observation_rowid: number; rank: number }>;

  return rows.map((row) => ({ observation_id: rowidToObservationId(db, row.observation_rowid), rank: row.rank }));
}

function rowidToObservationId(db: Database.Database, rowid: number): string {
  const row = db.prepare(`SELECT id FROM observations WHERE rowid = ?`).get(rowid) as { id: string } | undefined;
  if (row === undefined) {
    throw new Error(`observations_fts referenced rowid ${rowid} with no matching observations row`);
  }
  return row.id;
}
