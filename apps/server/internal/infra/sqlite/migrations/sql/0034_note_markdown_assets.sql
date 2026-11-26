-- A Note references an image asset by its Markdown destination
-- ![alt](/api/workspaces/<workspace>/assets/<asset id>). An asset id is
-- referenced when '/assets/<id>' is followed by ')' or a space, so "a1" never
-- matches "a12". Canvas references are unchanged from 0031.
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
SELECT a.workspace_id, a.id
FROM canvas_notes n
JOIN workspace_assets a
  ON instr(n.document_state, '/assets/' || a.id || ')') > 0
  OR instr(n.document_state, '/assets/' || a.id || ' ') > 0;

DROP TRIGGER IF EXISTS canvas_note_assets_reconcile_after_note_insert;
DROP TRIGGER IF EXISTS canvas_note_assets_reconcile_after_note_update;
DROP TRIGGER IF EXISTS canvas_note_assets_reconcile_after_note_delete;

CREATE TRIGGER canvas_note_assets_reconcile_after_note_insert
AFTER INSERT ON canvas_notes
BEGIN
  UPDATE workspace_assets
  SET staged=0
  WHERE EXISTS (
    SELECT 1 FROM workspace_asset_references r
    WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
  );
END;

CREATE TRIGGER canvas_note_assets_reconcile_after_note_update
AFTER UPDATE OF document_state ON canvas_notes
BEGIN
  UPDATE workspace_assets
  SET staged=0
  WHERE EXISTS (
    SELECT 1 FROM workspace_asset_references r
    WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
  );

  INSERT INTO workspace_asset_tombstones(workspace_id,id,deleted_at)
  SELECT workspace_id,id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM workspace_assets
  WHERE staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
    )
  ON CONFLICT(workspace_id,id) DO UPDATE SET deleted_at=excluded.deleted_at;

  DELETE FROM workspace_assets
  WHERE staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
    );
END;

CREATE TRIGGER canvas_note_assets_reconcile_after_note_delete
AFTER DELETE ON canvas_notes
BEGIN
  INSERT INTO workspace_asset_tombstones(workspace_id,id,deleted_at)
  SELECT workspace_id,id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM workspace_assets
  WHERE staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
    )
  ON CONFLICT(workspace_id,id) DO UPDATE SET deleted_at=excluded.deleted_at;

  DELETE FROM workspace_assets
  WHERE staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
    );
END;
