import assert from "node:assert/strict";
import test from "node:test";
import { defaultCanvasCodeBlock, withCanvasCodeBlock } from "../code/canvas-code-block.ts";
import { analyzeCanvasSelection, canvasStylePatchForElement, sharedCanvasValue, supportsCanvasStyle } from "./canvas-selection-capabilities.ts";

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
    { type: "rectangle", customData: withCanvasCodeBlock(undefined, defaultCanvasCodeBlock()) },
    { type: "rectangle" },
  ]);
  assert.equal(result.mixed, true);
  assert.equal(result.hasCode, true);
  assert.deepEqual(result.types, ["code", "rectangle"]);
  assert.equal(result.stroke, "some");
  assert.equal(result.fill, "some");
  assert.equal(result.opacity, "all");
});

test("malformed code metadata retains the underlying element capabilities", () => {
  const element = { type: "rectangle", customData: { notespaceCodeBlock: { version: 1 } } };
  const result = analyzeCanvasSelection([element]);
  assert.deepEqual(result.types, ["rectangle"]);
  assert.equal(result.hasCode, false);
  assert.equal(result.stroke, "all");
  assert.equal(result.fill, "all");
  assert.equal(supportsCanvasStyle(element, "strokeColor"), true);
  assert.deepEqual(canvasStylePatchForElement(element, { strokeColor: "red", backgroundColor: "blue" }), { strokeColor: "red", backgroundColor: "blue" });
});

test("embeddable selection exposes embed interaction only when every selected element is an embed", () => {
  assert.equal(analyzeCanvasSelection([{ type: "embeddable" }]).embed, "all");
  assert.equal(analyzeCanvasSelection([{ type: "embeddable" }, { type: "rectangle" }]).embed, "some");
  assert.equal(analyzeCanvasSelection([{ type: "rectangle" }]).embed, "none");
});

test("selection style distinguishes shared values, mixed values and unsupported properties", () => {
  assert.deepEqual(sharedCanvasValue([], (value: number) => value), { kind: "unsupported" });
  assert.deepEqual(sharedCanvasValue([1, 1], (value) => value), { kind: "shared", value: 1 });
  assert.deepEqual(sharedCanvasValue([1, 4], (value) => value), { kind: "mixed" });
  assert.deepEqual(sharedCanvasValue([null, null], (value) => value), { kind: "shared", value: null });
});

test("batch styles retain pressure and corners for homogeneous selections without touching unsupported elements", () => {
  const elements = [{ type: "freedraw" }, { type: "freedraw" }, { type: "rectangle" }, { type: "image" }];
  assert.deepEqual(elements.filter((element) => supportsCanvasStyle(element, "pressure")), elements.slice(0, 2));
  assert.deepEqual(elements.filter((element) => supportsCanvasStyle(element, "roundness")), [elements[2]]);
  assert.equal(supportsCanvasStyle(elements[3], "opacity"), true);
  assert.equal(supportsCanvasStyle(elements[3], "strokeColor"), false);
});

test("a batch pressure edit preserves each stroke's own options and patches only supported fields", () => {
  const patch = { strokeOptions: { variability: "constant", streamline: 0.1 }, backgroundColor: "red", opacity: 50 };
  const pen = { type: "freedraw", strokeOptions: { variability: "variable", streamline: 0.9 } };
  assert.deepEqual(canvasStylePatchForElement(pen, patch), { strokeOptions: { variability: "constant", streamline: 0.9 }, opacity: 50 });
  assert.deepEqual(canvasStylePatchForElement({ type: "image" }, patch), { opacity: 50 });
  assert.deepEqual(canvasStylePatchForElement({ type: "rectangle" }, patch), { backgroundColor: "red", opacity: 50 });
});
