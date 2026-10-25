-- Existing Canvas snapshots can retain Excalidraw tombstones for deleted shapes.
-- Recompute only the derived element-count projection; never mutate authored JSON.
UPDATE workspace_canvas
SET element_count = (
  SELECT COUNT(*) FROM json_each(json_extract(workspace_canvas.canvas_state, '$.data.elements')) AS element
  WHERE COALESCE(json_extract(element.value, '$.isDeleted'), 0) != 1
);
