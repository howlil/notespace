CREATE VIRTUAL TABLE workspace_search USING fts5(
  type UNINDEXED,
  category_id UNINDEXED,
  workspace_id UNINDEXED,
  workspace_title UNINDEXED,
  note_id UNINDEXED,
  note_title UNINDEXED,
  block_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE workspace_search_meta (
  workspace_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL
);
