-- New checkpoints keep metadata in workspace_history and the authored snapshot
-- in a compressed side table. The side table is separate so existing 0006
-- rows remain readable during a rolling deployment.
CREATE TABLE workspace_history_payload (
  history_id TEXT PRIMARY KEY REFERENCES workspace_history(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  codec TEXT NOT NULL,
  payload BLOB NOT NULL,
  payload_size INTEGER NOT NULL CHECK(payload_size >= 0)
);

CREATE INDEX workspace_history_payload_hash ON workspace_history_payload(content_hash);
