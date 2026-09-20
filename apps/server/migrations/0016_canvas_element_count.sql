ALTER TABLE workspace_canvas
ADD COLUMN element_count INTEGER NOT NULL DEFAULT 0 CHECK(element_count >= 0);

UPDATE workspace_canvas
SET element_count = (
  SELECT COUNT(*)
  FROM json_each(COALESCE(json_extract(workspace_canvas.canvas_state, '$.data.elements'), json('[]')))
);
