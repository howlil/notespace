CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO categories(id,title,created_at,updated_at)
VALUES ('legacy','Uncategorized',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE projects ADD COLUMN category_id TEXT NOT NULL DEFAULT 'legacy' REFERENCES categories(id);
CREATE INDEX projects_category_updated ON projects(category_id, updated_at DESC, id);
