-- Replace mandatory Categories with recursive parent_id Workspaces.
-- Ordinary categories become root Workspaces with valid empty Canvases,
-- existing Workspaces attach as their children (or root for 'legacy'), and
-- category_workspace_redirects preserves deep-link compatibility.

CREATE TABLE category_workspace_redirects (
  legacy_category_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE
);

WITH RECURSIVE candidates(cat_id, cat_rowid, n, candidate, occupied) AS (
  SELECT
    c.id,
    c.rowid,
    -1,
    c.id,
    CASE
      WHEN EXISTS (SELECT 1 FROM projects p WHERE p.id = c.id)
        OR EXISTS (SELECT 1 FROM workspace_trash t WHERE t.id = c.id)
      THEN 1 ELSE 0
    END
  FROM categories c
  WHERE c.id <> 'legacy'
  UNION ALL
  SELECT
    cat_id,
    cat_rowid,
    n + 1,
    'cat-' || cat_rowid || (CASE WHEN n + 1 = 0 THEN '' ELSE '-' || (n + 1) END) || '-' || substr(cat_id, 1, 80),
    CASE
      WHEN EXISTS (
        SELECT 1 FROM projects p WHERE p.id = ('cat-' || cat_rowid || (CASE WHEN n + 1 = 0 THEN '' ELSE '-' || (n + 1) END) || '-' || substr(cat_id, 1, 80))
      )
      OR EXISTS (
        SELECT 1 FROM workspace_trash t WHERE t.id = ('cat-' || cat_rowid || (CASE WHEN n + 1 = 0 THEN '' ELSE '-' || (n + 1) END) || '-' || substr(cat_id, 1, 80))
      )
      OR EXISTS (
        SELECT 1 FROM categories c2 WHERE c2.id = ('cat-' || cat_rowid || (CASE WHEN n + 1 = 0 THEN '' ELSE '-' || (n + 1) END) || '-' || substr(cat_id, 1, 80))
      )
      THEN 1 ELSE 0
    END
  FROM candidates
  WHERE occupied = 1
)
INSERT INTO category_workspace_redirects(legacy_category_id, workspace_id)
SELECT cat_id, candidate
FROM candidates
WHERE occupied = 0;

CREATE TABLE projects_hierarchy (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO projects_hierarchy(id, parent_id, title, created_at, updated_at, version)
SELECT r.workspace_id, NULL, c.title, c.created_at, c.updated_at, 1
FROM categories c
JOIN category_workspace_redirects r ON r.legacy_category_id = c.id;

INSERT INTO workspace_canvas(workspace_id, canvas_state, version, updated_at, element_count)
SELECT r.workspace_id, '{"format":"excalidraw","version":1,"data":{"elements":[],"appState":{},"files":{}}}', 1, c.updated_at, 0
FROM categories c
JOIN category_workspace_redirects r ON r.legacy_category_id = c.id;

INSERT INTO projects_hierarchy(id, parent_id, title, created_at, updated_at, version)
SELECT
  p.id,
  CASE
    WHEN p.category_id = 'legacy' THEN NULL
    ELSE (SELECT r.workspace_id FROM category_workspace_redirects r WHERE r.legacy_category_id = p.category_id)
  END,
  p.title,
  p.created_at,
  p.updated_at,
  p.version
FROM projects p;

DROP TABLE projects;
ALTER TABLE projects_hierarchy RENAME TO projects;

CREATE INDEX projects_updated ON projects(updated_at DESC, id);
CREATE INDEX projects_parent_updated ON projects(parent_id, updated_at DESC, id);
CREATE INDEX projects_parent_title ON projects(parent_id, title COLLATE NOCASE, id);

CREATE TABLE workspace_trash_hierarchy (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  title TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  payload BLOB NOT NULL
);

INSERT INTO workspace_trash_hierarchy(id, parent_id, title, deleted_at, payload)
SELECT
  t.id,
  CASE
    WHEN t.category_id = 'legacy' THEN NULL
    ELSE (SELECT r.workspace_id FROM category_workspace_redirects r WHERE r.legacy_category_id = t.category_id)
  END,
  t.title,
  t.deleted_at,
  t.payload
FROM workspace_trash t;

DROP TABLE workspace_trash;
ALTER TABLE workspace_trash_hierarchy RENAME TO workspace_trash;

CREATE INDEX workspace_trash_deleted ON workspace_trash(deleted_at DESC, id);
CREATE INDEX workspace_trash_parent ON workspace_trash(parent_id, deleted_at DESC);

DROP TABLE IF EXISTS workspace_search;
CREATE VIRTUAL TABLE workspace_search USING fts5(
  type UNINDEXED,
  parent_id UNINDEXED,
  workspace_id UNINDEXED,
  workspace_title UNINDEXED,
  note_id UNINDEXED,
  note_title UNINDEXED,
  block_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);

DROP TABLE IF EXISTS workspace_search_meta;
CREATE TABLE workspace_search_meta (
  workspace_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL
);

DELETE FROM canvas_note_search_meta;

DROP TABLE categories;
