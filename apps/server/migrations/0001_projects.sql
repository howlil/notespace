CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  document_state TEXT NOT NULL CHECK(json_valid(document_state)),
  canvas_state TEXT NOT NULL CHECK(json_valid(canvas_state)),
  split_ratio REAL NOT NULL CHECK(split_ratio BETWEEN 0.25 AND 0.7),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX projects_updated ON projects(updated_at DESC, id);
