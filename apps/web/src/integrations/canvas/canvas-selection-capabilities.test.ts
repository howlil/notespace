import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCanvasSelection } from "./canvas-selection-capabilities.ts";

test("single selection marks supported capabilities as all", () => {
  const result = analyzeCanvasSelection([{ type: "arrow" }]);
  assert.equal(result.mixed, false);
  assert.equal(result.stroke, "all");
  assert.equal(result.opacity, "all");
  assert.equal(result.arrow, "all");
  assert.equal(result.text, "none");
  assert.equal(result.fill, "none");
});

test("mixed shape text arrow and pen distinguishes common from partial capabilities", () => {
  const result = analyzeCanvasSelection([
    { type: "rectangle" },
    { type: "text" },
    { type: "arrow" },
    { type: "freedraw" },
  ]);
  assert.equal(result.mixed, true);
  assert.deepEqual(result.types, ["rectangle", "text", "arrow", "freedraw"]);
  assert.equal(result.stroke, "all");
  assert.equal(result.opacity, "all");
  assert.equal(result.fill, "some");
  assert.equal(result.line, "some");
  assert.equal(result.arrow, "some");
  assert.equal(result.text, "some");
  assert.equal(result.freeDraw, "some");
});

test("code blocks do not make drawing styles look common", () => {
  const result = analyzeCanvasSelection([
    { type: "rectangle", customData: { notespaceCodeBlock: { version: 1 } } },
    { type: "rectangle" },
  ]);
  assert.equal(result.mixed, true);
  assert.equal(result.hasCode, true);
  assert.deepEqual(result.types, ["code", "rectangle"]);
  assert.equal(result.stroke, "some");
  assert.equal(result.fill, "some");
  assert.equal(result.opacity, "all");
});

test("embeddable selection exposes embed interaction only when every selected element is an embed", () => {
  assert.equal(analyzeCanvasSelection([{ type: "embeddable" }]).embed, "all");
  assert.equal(analyzeCanvasSelection([{ type: "embeddable" }, { type: "rectangle" }]).embed, "some");
  assert.equal(analyzeCanvasSelection([{ type: "rectangle" }]).embed, "none");
});
