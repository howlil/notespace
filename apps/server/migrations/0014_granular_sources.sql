ALTER TABLE projects
ADD COLUMN notes_revision INTEGER NOT NULL DEFAULT 1 CHECK(notes_revision >= 1);

ALTER TABLE workspace_search_meta
ADD COLUMN notes_revision INTEGER NOT NULL DEFAULT 0 CHECK(notes_revision >= 0);

DROP TRIGGER IF EXISTS workspace_assets_reconcile_after_project_update;
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
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%';

CREATE TRIGGER workspace_assets_reconcile_after_note_insert
AFTER INSERT ON workspace_notes
BEGIN
  UPDATE workspace_assets
  SET staged=0
  WHERE workspace_id=NEW.workspace_id
    AND EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );
END;

CREATE TRIGGER workspace_assets_reconcile_after_note_update
AFTER UPDATE OF document_state ON workspace_notes
BEGIN
  UPDATE workspace_assets
  SET staged=0
  WHERE workspace_id=NEW.workspace_id
    AND EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );

  INSERT INTO workspace_asset_tombstones(workspace_id,id,deleted_at)
  SELECT workspace_id,id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM workspace_assets
  WHERE workspace_id=NEW.workspace_id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    )
  ON CONFLICT(workspace_id,id) DO UPDATE SET deleted_at=excluded.deleted_at;

  DELETE FROM workspace_assets
  WHERE workspace_id=NEW.workspace_id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );

  DELETE FROM workspace_assets
  WHERE workspace_id=NEW.workspace_id
    AND staged=1
    AND julianday(created_at) < julianday('now','-1 day')
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );
END;

CREATE TRIGGER workspace_assets_reconcile_after_note_delete
AFTER DELETE ON workspace_notes
BEGIN
  INSERT INTO workspace_asset_tombstones(workspace_id,id,deleted_at)
  SELECT workspace_id,id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM workspace_assets
  WHERE workspace_id=OLD.workspace_id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=OLD.workspace_id AND r.asset_id=workspace_assets.id
    )
  ON CONFLICT(workspace_id,id) DO UPDATE SET deleted_at=excluded.deleted_at;

  DELETE FROM workspace_assets
  WHERE workspace_id=OLD.workspace_id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=OLD.workspace_id AND r.asset_id=workspace_assets.id
    );
END;

CREATE TRIGGER workspace_assets_reconcile_after_canvas_update
AFTER UPDATE OF canvas_state ON workspace_canvas
BEGIN
  UPDATE workspace_assets
  SET staged=0
  WHERE workspace_id=NEW.workspace_id
    AND EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );

  INSERT INTO workspace_asset_tombstones(workspace_id,id,deleted_at)
  SELECT workspace_id,id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM workspace_assets
  WHERE workspace_id=NEW.workspace_id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    )
  ON CONFLICT(workspace_id,id) DO UPDATE SET deleted_at=excluded.deleted_at;

  DELETE FROM workspace_assets
  WHERE workspace_id=NEW.workspace_id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );

  DELETE FROM workspace_assets
  WHERE workspace_id=NEW.workspace_id
    AND staged=1
    AND julianday(created_at) < julianday('now','-1 day')
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.workspace_id AND r.asset_id=workspace_assets.id
    );
END;
