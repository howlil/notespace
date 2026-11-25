ALTER TABLE study_sessions ADD COLUMN logical_session_id TEXT NOT NULL DEFAULT '';

UPDATE study_sessions
SET logical_session_id = CASE
  WHEN instr(id, ':') > 0 THEN substr(id, 1, instr(id, ':') - 1)
  ELSE id
END
WHERE logical_session_id = '';

CREATE TRIGGER study_sessions_logical_session_insert
AFTER INSERT ON study_sessions
WHEN NEW.logical_session_id = ''
BEGIN
  UPDATE study_sessions
  SET logical_session_id = CASE
    WHEN instr(NEW.id, ':') > 0 THEN substr(NEW.id, 1, instr(NEW.id, ':') - 1)
    ELSE NEW.id
  END
  WHERE id = NEW.id;
END;

CREATE INDEX study_sessions_workspace_logical_idx
ON study_sessions(workspace_id, logical_session_id);
