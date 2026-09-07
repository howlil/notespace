ALTER TABLE workspace_assets ADD COLUMN staged INTEGER NOT NULL DEFAULT 1 CHECK(staged IN (0,1));

CREATE VIEW workspace_asset_references AS
SELECT p.id AS workspace_id, CAST(j.value AS TEXT) AS asset_id
FROM projects p, json_tree(p.document_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT p.id, CAST(j.value AS TEXT)
FROM projects p, json_tree(p.notes_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT p.id, CAST(j.value AS TEXT)
FROM projects p, json_tree(p.canvas_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT p.id, CAST(j.value AS TEXT)
FROM projects p, json_tree(p.references_state) j
WHERE j.type='text' AND j.key IN ('assetId','fileId')
UNION
SELECT p.id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM projects p, json_tree(p.document_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%'
UNION
SELECT p.id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM projects p, json_tree(p.notes_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%'
UNION
SELECT p.id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM projects p, json_tree(p.canvas_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%'
UNION
SELECT p.id, substr(CAST(j.value AS TEXT), length('notespace-asset://') + 1)
FROM projects p, json_tree(p.references_state) j
WHERE j.type='text' AND j.key='src' AND CAST(j.value AS TEXT) LIKE 'notespace-asset://%';

-- Existing assets were created before staged/live ownership existed. Startup is
-- a quiescent boundary, so reconcile them immediately and remove legacy orphans.
UPDATE workspace_assets
SET staged=0
WHERE EXISTS (
  SELECT 1 FROM workspace_asset_references r
  WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
);
DELETE FROM workspace_assets
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_asset_references r
  WHERE r.workspace_id=workspace_assets.workspace_id AND r.asset_id=workspace_assets.id
);

CREATE TRIGGER workspace_assets_reconcile_after_project_update
AFTER UPDATE OF document_state,notes_state,canvas_state,references_state ON projects
BEGIN
  UPDATE workspace_assets
  SET staged=0
  WHERE workspace_id=NEW.id
    AND EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.id AND r.asset_id=workspace_assets.id
    );

  DELETE FROM workspace_assets
  WHERE workspace_id=NEW.id
    AND staged=0
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.id AND r.asset_id=workspace_assets.id
    );

  -- Interrupted uploads never become live. Keep a grace window so upload-before-
  -- save flows are safe, then remove abandoned staged blobs on a later save.
  DELETE FROM workspace_assets
  WHERE workspace_id=NEW.id
    AND staged=1
    AND julianday(created_at) < julianday('now','-1 day')
    AND NOT EXISTS (
      SELECT 1 FROM workspace_asset_references r
      WHERE r.workspace_id=NEW.id AND r.asset_id=workspace_assets.id
    );
END;
