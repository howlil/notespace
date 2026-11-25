CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_title_snapshot TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds >= 0),
  last_heartbeat_at TEXT NOT NULL
);

CREATE INDEX study_sessions_activity_date ON study_sessions(activity_date);
CREATE INDEX study_sessions_workspace_date ON study_sessions(workspace_id, activity_date);
