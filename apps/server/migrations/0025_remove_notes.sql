-- Notes are retired. Keep the historical schema append-only, remove relational
-- Note state, and let the application migration hook scrub opaque payloads.

DELETE FROM workspace_notes;
DELETE FROM workspace_search WHERE type IN ('note', 'block');
UPDATE workspace_search_meta SET notes_revision=0;

-- References and legacy authored/history payloads can contain Note block data.
UPDATE projects SET references_state='[]', notes_revision=1;
UPDATE workspace_history
SET document_state='{"format":"tiptap","version":1,"data":{"type":"doc","content":[]}}',
    notes_state='[]', references_state='[]';

-- A converted Note capture remains useful as source material, but its retired
-- target is removed so it can no longer resolve to a deleted Note.
UPDATE capture_items
SET status='pending', version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    target_kind=NULL, target_workspace_id=NULL, target_id=NULL, converted_at=NULL
WHERE target_kind='note';

-- Trash envelopes stay in this transaction. The migration hook scrubs Note
-- payloads and leaves id, category, title, and deleted_at unchanged.
