CREATE TABLE workspace_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  document_state TEXT NOT NULL CHECK(json_valid(document_state)),
  notes_state TEXT NOT NULL CHECK(json_valid(notes_state)),
  canvas_state TEXT NOT NULL CHECK(json_valid(canvas_state)),
  references_state TEXT NOT NULL CHECK(json_valid(references_state)),
  split_ratio REAL NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX workspace_history_workspace_created ON workspace_history(workspace_id, created_at DESC);
