ALTER TABLE projects ADD COLUMN references_state TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(references_state));
