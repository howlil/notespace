import assert from "node:assert/strict";
import test from "node:test";
import { hoveredFlowchartDirection } from "./CanvasDirectionalSpawn.ts";

const bounds = { left: 100, top: 100, right: 240, bottom: 180 };

test("one directional handle is selected only near the hovered edge", () => {
  assert.equal(hoveredFlowchartDirection(bounds, 170, 106), "up");
  assert.equal(hoveredFlowchartDirection(bounds, 235, 140), "right");
  assert.equal(hoveredFlowchartDirection(bounds, 170, 177), "down");
  assert.equal(hoveredFlowchartDirection(bounds, 105, 140), "left");
  assert.equal(hoveredFlowchartDirection(bounds, 170, 140), null);
  assert.equal(hoveredFlowchartDirection(bounds, 300, 230), null);
  assert.equal(hoveredFlowchartDirection(bounds, 258, 140), "right"); // button center remains reachable
});

test("corner hover is stable and invalid geometry cannot render controls", () => {
  assert.equal(hoveredFlowchartDirection(bounds, 101, 101, "left"), "left");
  assert.equal(hoveredFlowchartDirection(bounds, 102, 101, "up"), "up");
  assert.equal(hoveredFlowchartDirection(bounds, 190, 102, "left"), "up");
  assert.equal(hoveredFlowchartDirection({ left: 1, top: 1, right: 1, bottom: 5 }, 1, 2), null);
  assert.equal(hoveredFlowchartDirection(bounds, Number.NaN, 120), null);
});
