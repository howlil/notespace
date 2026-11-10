import assert from "node:assert/strict";
import test from "node:test";
import { selectionPanelPosition } from "./canvas-selection-position.ts";

const root = { top: 100, bottom: 140, left: 100, right: 140, width: 40 };
const panel = { width: 80, height: 60 };
const surface = { top: 0, bottom: 300, left: 0, right: 300 };

test("selection popup retains right/above/below placements and surface clamping", () => {
  assert.deepEqual(selectionPanelPosition(root, panel, surface, { compact: false, vertical: true }), { placement: "right", left: 44, top: 0 });
  assert.deepEqual(selectionPanelPosition(root, panel, surface, { compact: false, vertical: false }), { placement: "above", left: -20, top: -64 });
  assert.deepEqual(selectionPanelPosition({ ...root, top: 10, bottom: 50 }, panel, surface, { compact: true, vertical: false }), { placement: "below", left: -20, top: 44 });
  assert.deepEqual(selectionPanelPosition({ ...root, left: 260, right: 300 }, panel, surface, { compact: false, vertical: true }), { placement: "above", left: -44, top: -64 });
  assert.deepEqual(selectionPanelPosition({ ...root, top: 290, bottom: 330 }, panel, surface, { compact: true, vertical: true }), { placement: "right", left: 44, top: -54 });
});
