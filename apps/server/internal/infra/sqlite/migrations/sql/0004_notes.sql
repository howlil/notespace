ALTER TABLE projects ADD COLUMN notes_state TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(notes_state));
UPDATE projects
SET notes_state = json_array(json_object(
  'id', lower(hex(randomblob(16))),
  'title', 'Untitled',
  'document', json(document_state),
  'createdAt', created_at,
  'updatedAt', updated_at
))
WHERE notes_state = '[]';
