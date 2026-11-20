-- Canvas Note Trash: a trashed Note keeps its content, revision and instance
-- rows so Restore returns it to every Canvas that placed it. NULL means active.
ALTER TABLE canvas_notes ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS canvas_notes_trashed_idx
  ON canvas_notes(deleted_at DESC, id) WHERE deleted_at IS NOT NULL;
