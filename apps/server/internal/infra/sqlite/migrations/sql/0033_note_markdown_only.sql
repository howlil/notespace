-- Markdown is the only canonical Note format. The Go step that runs with this
-- migration (store.convertNotesToMarkdownTx) rewrites every retired rich
-- document as Markdown in this same transaction. The original document is kept
-- here, one row per converted Note, so a conversion can be audited or reversed
-- by hand. Rows are removed with their Note, so permanent deletion still deletes
-- the content.
CREATE TABLE IF NOT EXISTS canvas_note_legacy_documents (
  note_id TEXT PRIMARY KEY REFERENCES canvas_notes(id) ON DELETE CASCADE,
  document_state TEXT NOT NULL CHECK(json_valid(document_state)),
  degraded TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(degraded)),
  migrated_at TEXT NOT NULL
);

-- The note triggers read asset references out of the document. While rich
-- documents are being rewritten they would see no references and release the
-- images. 0034 recreates them against the Markdown reference form once every
-- document has been converted.
DROP TRIGGER IF EXISTS canvas_note_assets_reconcile_after_note_insert;
DROP TRIGGER IF EXISTS canvas_note_assets_reconcile_after_note_update;
DROP TRIGGER IF EXISTS canvas_note_assets_reconcile_after_note_delete;
