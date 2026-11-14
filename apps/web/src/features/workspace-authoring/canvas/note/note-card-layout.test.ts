import assert from "node:assert/strict";
import test from "node:test";
import { NOTE_CARD_LABEL_ZOOM, noteCardDetail, noteCardFrame, noteCardLabelFontSize, noteCardUiScale } from "./note-card-layout.ts";

const element = { x: 100, y: 40, width: 320, height: 200, angle: 0 };

test("card frame keeps Canvas-unit size and scales as one surface at any zoom", () => {
  for (const zoom of [0.5, 1, 2]) {
    const frame = noteCardFrame(element, { zoom, scrollX: 10, scrollY: -20 }, false);
    assert.equal(frame.left, 110 * zoom);
    assert.equal(frame.top, 20 * zoom);
    assert.equal(frame.width, 320, "width stays in Canvas units so wrapping never depends on zoom");
    assert.equal(frame.minHeight, 200);
    assert.equal(frame.transform, `scale(${zoom})`);
    assert.equal(frame.transformOrigin, "0 0");
  }
});

test("folded cards follow their first line instead of the instance height, and rotation turns around the center", () => {
  const collapsed = noteCardFrame(element, { zoom: 1, scrollX: 0, scrollY: 0 }, true);
  assert.equal(collapsed.minHeight, 0);
  const rotated = noteCardFrame({ ...element, angle: Math.PI / 2 }, { zoom: 2, scrollX: 0, scrollY: 0 }, false);
  assert.equal(rotated.transform, `scale(2) translate(160px, 100px) rotate(${Math.PI / 2}rad) translate(-160px, -100px)`);
});

test("zoomed-out cards show a readable label while editing always keeps content", () => {
  assert.equal(noteCardDetail(1, false), "content");
  assert.equal(noteCardDetail(NOTE_CARD_LABEL_ZOOM, false), "content");
  assert.equal(noteCardDetail(0.2, false), "label");
  assert.equal(noteCardDetail(0.2, true), "content");
  assert.equal(noteCardLabelFontSize(1), 14);
  assert.ok(noteCardLabelFontSize(0.2) > 14 && noteCardLabelFontSize(0.2) <= 48);
  assert.equal(noteCardLabelFontSize(0.01), 48);
});

test("contextual UI counter-scales and invalid zoom falls back to identity", () => {
  assert.equal(noteCardUiScale(0.5), 2);
  assert.equal(noteCardUiScale(0), 1);
  assert.equal(noteCardFrame(element, { zoom: Number.NaN, scrollX: 0, scrollY: 0 }, false).transform, "scale(1)");
});
