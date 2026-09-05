CREATE TABLE workspace_assets (
  workspace_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX workspace_assets_workspace_idx ON workspace_assets(workspace_id, created_at);
