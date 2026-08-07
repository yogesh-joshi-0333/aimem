-- ALTER TABLE ADD COLUMN has no IF NOT EXISTS guard in SQLite and migrations
-- re-run on every startup (see storage-engine.ts runMigrations), so this
-- column is added conditionally in JS via StorageEngine.addInvalidatedAtColumnIfNeeded()
-- rather than here -- a second unconditional ALTER TABLE would throw
-- "duplicate column name" on every startup after the first.

CREATE INDEX IF NOT EXISTS idx_observations_invalidated_at ON observations (invalidated_at);
