CREATE TABLE workspace_notes (
  workspace_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  document_state TEXT NOT NULL CHECK(json_valid(document_state)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  PRIMARY KEY(workspace_id, id)
);

CREATE INDEX workspace_notes_workspace_updated_idx
ON workspace_notes(workspace_id, updated_at DESC, id);

INSERT INTO workspace_notes(workspace_id,id,title,document_state,created_at,updated_at,version)
SELECT
  p.id,
  json_extract(note.value, '$.id'),
  json_extract(note.value, '$.title'),
  json_extract(note.value, '$.document'),
  COALESCE(NULLIF(json_extract(note.value, '$.createdAt'), ''), p.created_at),
  COALESCE(NULLIF(json_extract(note.value, '$.updatedAt'), ''), p.updated_at),
  1
FROM projects p, json_each(p.notes_state) AS note
WHERE json_type(note.value, '$.id') = 'text'
  AND json_type(note.value, '$.title') = 'text'
  AND json_type(note.value, '$.document') = 'object';

INSERT INTO workspace_notes(workspace_id,id,title,document_state,created_at,updated_at,version)
SELECT p.id,p.id || '-default','Untitled',p.document_state,p.created_at,p.updated_at,1
FROM projects p
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_notes n WHERE n.workspace_id=p.id
);

CREATE TABLE workspace_canvas (
  workspace_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  canvas_state TEXT NOT NULL CHECK(json_valid(canvas_state)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  updated_at TEXT NOT NULL
);

INSERT INTO workspace_canvas(workspace_id,canvas_state,version,updated_at)
SELECT id,canvas_state,1,updated_at FROM projects;
