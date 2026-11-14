-- Issue #203: canonical Canvas Note content is separate from retired
-- workspace_notes compatibility state. Canvas owns geometry in its scene;
-- these tables own the global document identity and an index of instances.
CREATE TABLE IF NOT EXISTS canvas_notes (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  document_state TEXT NOT NULL CHECK(json_valid(document_state)),
  revision INTEGER NOT NULL CHECK(revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canvas_note_instances (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES canvas_notes(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL CHECK(width >= 160 AND width <= 10000),
  height REAL NOT NULL CHECK(height >= 48 AND height <= 10000),
  compact INTEGER NOT NULL DEFAULT 0 CHECK(compact IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(workspace_id, element_id)
);

CREATE INDEX IF NOT EXISTS canvas_note_instances_note_idx
  ON canvas_note_instances(note_id, workspace_id, id);

CREATE INDEX IF NOT EXISTS canvas_note_instances_workspace_idx
  ON canvas_note_instances(workspace_id, updated_at DESC, id);

CREATE TABLE IF NOT EXISTS canvas_note_create_requests (
  workspace_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES canvas_notes(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL REFERENCES canvas_note_instances(id) ON DELETE CASCADE,
  canvas_version INTEGER NOT NULL CHECK(canvas_version > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id, client_request_id)
);
