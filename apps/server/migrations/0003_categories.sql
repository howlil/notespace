CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO categories(id,title,created_at,updated_at)
VALUES ('legacy','Uncategorized',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
-- SQLite does not allow ADD COLUMN to combine a REFERENCES clause with a
-- non-NULL default. Rebuild the table so existing workspaces are assigned to
-- the compatibility category while the NOT NULL and foreign-key invariants
-- remain enforced for future writes.
CREATE TABLE projects_with_categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  document_state TEXT NOT NULL CHECK(json_valid(document_state)),
  canvas_state TEXT NOT NULL CHECK(json_valid(canvas_state)),
  split_ratio REAL NOT NULL CHECK(split_ratio BETWEEN 0.25 AND 0.7),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  references_state TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(references_state)),
  category_id TEXT NOT NULL REFERENCES categories(id)
);
INSERT INTO projects_with_categories(
  id,title,document_state,canvas_state,split_ratio,created_at,updated_at,version,references_state,category_id
)
SELECT id,title,document_state,canvas_state,split_ratio,created_at,updated_at,version,references_state,'legacy'
FROM projects;
DROP TABLE projects;
ALTER TABLE projects_with_categories RENAME TO projects;
CREATE INDEX projects_updated ON projects(updated_at DESC, id);
CREATE INDEX projects_category_updated ON projects(category_id, updated_at DESC, id);
