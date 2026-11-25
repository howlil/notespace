CREATE TABLE capture_items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL CHECK(length(content)>0 AND length(CAST(content AS BLOB))<=65536),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','converted')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  target_kind TEXT,
  target_workspace_id TEXT,
  target_id TEXT,
  converted_at TEXT,
  CHECK (
    (status='pending' AND target_kind IS NULL AND target_workspace_id IS NULL
      AND target_id IS NULL AND converted_at IS NULL)
    OR
    (status='converted' AND target_kind IN ('note','task')
      AND target_workspace_id IS NOT NULL AND target_id IS NOT NULL AND converted_at IS NOT NULL)
  )
);

CREATE INDEX capture_items_pending_order
ON capture_items(status, created_at DESC, id DESC);
