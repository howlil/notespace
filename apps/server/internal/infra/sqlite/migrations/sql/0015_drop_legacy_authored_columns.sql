-- Note and Canvas authored state became canonical in workspace_notes and
-- workspace_canvas in migrations 0013-0014. Keep projects focused on workspace
-- metadata so ordinary authoring no longer duplicates large JSON snapshots.
ALTER TABLE projects DROP COLUMN document_state;
ALTER TABLE projects DROP COLUMN notes_state;
ALTER TABLE projects DROP COLUMN canvas_state;
