import assert from "node:assert/strict";
import test from "node:test";
import { placeEditorPopup } from "./editor-floating.ts";

test("keeps an editor popup below the caret when there is room", () => {
  assert.deepEqual(
    placeEditorPopup(
      { left: 300, top: 180, bottom: 200 },
      { width: 220, height: 180 },
      { width: 1280, height: 800 },
    ),
    { x: 300, y: 208, placement: "bottom" },
  );
});

test("flips an editor popup above a caret near the viewport bottom", () => {
  assert.deepEqual(
    placeEditorPopup(
      { left: 300, top: 720, bottom: 742 },
      { width: 220, height: 240 },
      { width: 1280, height: 800 },
    ),
    { x: 300, y: 472, placement: "top" },
  );
});

test("clamps a popup inside narrow viewport edges", () => {
  assert.deepEqual(
    placeEditorPopup(
      { left: 390, top: 120, bottom: 142 },
      { width: 220, height: 160 },
      { width: 420, height: 700 },
    ),
    { x: 188, y: 150, placement: "bottom" },
  );
});
