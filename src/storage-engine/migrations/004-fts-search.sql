CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  observation,
  content='observations',
  content_rowid='rowid'
);

-- Keep observations_fts in sync with observations without any application code
-- (standard FTS5 external-content sync pattern).
CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts (rowid, observation) VALUES (new.rowid, new.observation);
END;

CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts (observations_fts, rowid, observation) VALUES ('delete', old.rowid, old.observation);
END;

CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts (observations_fts, rowid, observation) VALUES ('delete', old.rowid, old.observation);
  INSERT INTO observations_fts (rowid, observation) VALUES (new.rowid, new.observation);
END;

-- Backfill of any pre-existing rows (upgrade from a pre-FTS5 memory.db) happens
-- in StorageEngine.runMigrations() in JS, not here — FTS5's external-content
-- 'rebuild' command only works via a literal `INSERT INTO fts(fts) VALUES
-- ('rebuild')`, not a conditional SELECT-based INSERT (verified: the
-- SELECT-based form silently fails to populate the index), and this
-- migration file has no way to express "only run VALUES('rebuild') if the
-- index is actually empty" in pure SQL without executing it unconditionally
-- on every startup once real data exists.
