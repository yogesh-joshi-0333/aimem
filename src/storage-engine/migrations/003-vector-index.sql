CREATE TABLE IF NOT EXISTS observation_embeddings (
  observation_id TEXT PRIMARY KEY,
  vec_rowid INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (observation_id) REFERENCES observations (id)
);

CREATE INDEX IF NOT EXISTS idx_observation_embeddings_vec_rowid ON observation_embeddings (vec_rowid);
