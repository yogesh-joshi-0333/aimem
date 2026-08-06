CREATE TABLE IF NOT EXISTS observation_versions (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  value TEXT NOT NULL,
  superseded_at TEXT NOT NULL,
  superseded_by_version INTEGER NOT NULL,
  FOREIGN KEY (observation_id) REFERENCES observations (id)
);

CREATE INDEX IF NOT EXISTS idx_observation_versions_observation_id ON observation_versions (observation_id);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  observation_id TEXT NOT NULL,
  existing_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (observation_id) REFERENCES observations (id)
);

CREATE INDEX IF NOT EXISTS idx_conflicts_observation_id ON conflicts (observation_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts (status);
