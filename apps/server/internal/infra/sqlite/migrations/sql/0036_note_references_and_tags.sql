CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES canvas_notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id, note_id);

CREATE TABLE note_references (
  source_note_id TEXT NOT NULL REFERENCES canvas_notes(id) ON DELETE CASCADE,
  target_note_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  context_excerpt TEXT NOT NULL DEFAULT '',
  occurrence_index INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_note_id, target_note_id, kind, occurrence_index)
);

CREATE INDEX idx_note_references_target ON note_references(target_note_id, source_note_id);
