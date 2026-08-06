CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (name, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_entities_entity_type ON entities (entity_type);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_entity_id TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_entity_id) REFERENCES entities (id),
  FOREIGN KEY (to_entity_id) REFERENCES entities (id)
);

CREATE INDEX IF NOT EXISTS idx_relations_from_entity_id ON relations (from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_to_entity_id ON relations (to_entity_id);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  attribute TEXT,
  observation TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_trigger TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities (id)
);

CREATE INDEX IF NOT EXISTS idx_observations_entity_id ON observations (entity_id);
CREATE INDEX IF NOT EXISTS idx_observations_attribute ON observations (attribute);
