CREATE TABLE workspace_trash (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  payload BLOB NOT NULL
);

CREATE INDEX workspace_trash_deleted ON workspace_trash(deleted_at DESC, id);
CREATE INDEX workspace_trash_category ON workspace_trash(category_id, deleted_at DESC);
