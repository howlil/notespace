-- Contract retired Planning, Capture, Activity, Legacy Notes, and History schema objects.
DROP TRIGGER IF EXISTS workspace_assets_reconcile_after_note_insert;
DROP TRIGGER IF EXISTS workspace_assets_reconcile_after_note_update;
DROP TRIGGER IF EXISTS workspace_assets_reconcile_after_note_delete;
DROP TRIGGER IF EXISTS activity_sessions_logical_session_insert;

DROP VIEW IF EXISTS workspace_asset_references;

CREATE VIEW workspace_asset_references AS
SELECT c.workspace_id, CAST(j.value AS TEXT) AS asset_id
FROM workspace_canvas c, json_tree(c.canvas_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT c.workspace_id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM workspace_canvas c, json_tree(c.canvas_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%'
UNION
SELECT i.workspace_id, CAST(j.value AS TEXT)
FROM canvas_notes n
JOIN canvas_note_instances i ON i.note_id=n.id
JOIN json_tree(n.document_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT a.workspace_id, a.id
FROM canvas_notes n
JOIN json_tree(n.document_state) j
JOIN workspace_assets a ON a.id=CAST(j.value AS TEXT)
WHERE j.type='text' AND j.key IN ('assetId','fileId');

DROP TABLE IF EXISTS workspace_history_payload;
DROP TABLE IF EXISTS workspace_history;
DROP TABLE IF EXISTS workspace_notes;
DROP TABLE IF EXISTS capture_items;
DROP TABLE IF EXISTS planning_tasks;
DROP TABLE IF EXISTS workspace_milestones;
DROP TABLE IF EXISTS planning_create_requests;
DROP TABLE IF EXISTS activity_sessions;
DROP TABLE IF EXISTS activity_deleted_sessions;

ALTER TABLE projects DROP COLUMN references_state;
ALTER TABLE projects DROP COLUMN split_ratio;
ALTER TABLE projects DROP COLUMN notes_revision;
ALTER TABLE workspace_search_meta DROP COLUMN notes_revision;
