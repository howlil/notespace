-- Issue #203: Canvas Note search projection tracks per-Note staleness so a
-- search only reindexes Notes whose content or placement changed, instead of
-- rebuilding every Note row on each query. `revision`/`updated_at` mirror
-- canvas_notes so the derived FTS rows can be reconciled lazily.
CREATE TABLE IF NOT EXISTS canvas_note_search_meta (
  note_id TEXT PRIMARY KEY REFERENCES canvas_notes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  updated_at TEXT NOT NULL
);