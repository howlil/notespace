CREATE TABLE activity_sessions (
  id TEXT PRIMARY KEY,
  logical_session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  workspace_title_snapshot TEXT NOT NULL DEFAULT '',
  task_id TEXT NOT NULL DEFAULT '',
  task_title_snapshot TEXT NOT NULL DEFAULT '',
  activity_title TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('build','learn','read','write','exercise','other')),
  activity_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  active_seconds INTEGER NOT NULL DEFAULT 0 CHECK(active_seconds >= 0),
  last_heartbeat_at TEXT NOT NULL
);

INSERT INTO activity_sessions(
  id,logical_session_id,workspace_id,workspace_title_snapshot,
  task_id,task_title_snapshot,activity_title,activity_type,
  activity_date,started_at,ended_at,active_seconds,last_heartbeat_at
)
SELECT
  id,logical_session_id,workspace_id,workspace_title_snapshot,
  '','',workspace_title_snapshot,'learn',
  activity_date,started_at,ended_at,active_seconds,last_heartbeat_at
FROM study_sessions;

DROP TRIGGER IF EXISTS study_sessions_logical_session_insert;
DROP TABLE study_sessions;

CREATE TRIGGER activity_sessions_logical_session_insert
AFTER INSERT ON activity_sessions
WHEN NEW.logical_session_id = ''
BEGIN
  UPDATE activity_sessions
  SET logical_session_id = CASE
    WHEN instr(NEW.id, ':') > 0 THEN substr(NEW.id, 1, instr(NEW.id, ':') - 1)
    ELSE NEW.id
  END
  WHERE id = NEW.id;
END;

CREATE INDEX activity_sessions_activity_date
  ON activity_sessions(activity_date);

CREATE INDEX activity_sessions_workspace_date
  ON activity_sessions(workspace_id, activity_date);

CREATE INDEX activity_sessions_task_date
  ON activity_sessions(task_id, activity_date);

CREATE INDEX activity_sessions_logical_idx
  ON activity_sessions(logical_session_id);
