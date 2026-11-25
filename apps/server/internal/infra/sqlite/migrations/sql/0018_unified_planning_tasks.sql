CREATE TABLE planning_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES workspace_milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL CHECK(position >= 0),
  planned_for TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  CHECK(milestone_id IS NULL OR workspace_id IS NOT NULL)
);

INSERT INTO planning_tasks(
  id,workspace_id,milestone_id,title,description,position,planned_for,
  completed_at,created_at,updated_at,version
)
SELECT
  id,workspace_id,milestone_id,title,description,position,NULL,
  completed_at,created_at,updated_at,version
FROM workspace_tasks;

DROP TABLE workspace_tasks;

CREATE INDEX planning_tasks_workspace_milestone_position
  ON planning_tasks(workspace_id, milestone_id, position, id);

CREATE INDEX planning_tasks_planned_for
  ON planning_tasks(planned_for, completed_at, position, id);
