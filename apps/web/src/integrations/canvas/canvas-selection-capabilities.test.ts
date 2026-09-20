import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCanvasSelection } from "./canvas-selection-capabilities.ts";

test("single selection exposes its specialized capabilities", () => {
  const result = analyzeCanvasSelection([{ type: "arrow" }]);
  assert.equal(result.mixed, false);
  assert.equal(result.common.stroke, true);
  assert.equal(result.common.opacity, true);
  assert.equal(result.specific.arrow, true);
  assert.equal(result.specific.text, false);
});

test("mixed shape text arrow and pen exposes common actions plus grouped specifics", () => {
  const result = analyzeCanvasSelection([
    { type: "rectangle" },
    { type: "text" },
    { type: "arrow" },
    { type: "freedraw" },
  ]);
  assert.equal(result.mixed, true);
  assert.deepEqual(result.types, ["rectangle", "text", "arrow", "freedraw"]);
  assert.equal(result.common.stroke, true);
  assert.equal(result.common.opacity, true);
  assert.deepEqual(result.specific, {
    fill: true,
    line: true,
    arrow: true,
    text: true,
    freeDraw: true,
  });
});

test("code blocks are semantic code selections instead of generic rectangles", () => {
  const result = analyzeCanvasSelection([
    { type: "rectangle", customData: { notespaceCodeBlock: { version: 1 } } },
    { type: "rectangle" },
  ]);
  assert.equal(result.mixed, true);
  assert.equal(result.hasCode, true);
  assert.deepEqual(result.types, ["code", "rectangle"]);
});
