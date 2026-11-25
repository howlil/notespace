-- Issue #203: Canonical Canvas Notes own their image references independently
-- of placement instances (B09/B10/K8). Removing an instance from a Canvas must
-- not delete an asset that is still referenced by a live canonical Note.
DROP VIEW IF EXISTS workspace_asset_references;

CREATE VIEW workspace_asset_references AS
SELECT n.workspace_id, CAST(j.value AS TEXT) AS asset_id
FROM workspace_notes n, json_tree(n.document_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT c.workspace_id, CAST(j.value AS TEXT)
FROM workspace_canvas c, json_tree(c.canvas_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT p.id, CAST(j.value AS TEXT)
FROM projects p, json_tree(p.references_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT n.workspace_id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM workspace_notes n, json_tree(n.document_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%'
UNION
SELECT c.workspace_id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM workspace_canvas c, json_tree(c.canvas_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%'
UNION
SELECT p.id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM projects p, json_tree(p.references_state) j
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
