import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_BACKGROUND_PATTERNS,
  CANVAS_BACKGROUND_PATTERN_STORAGE_KEY,
  CANVAS_PATTERN_MIN_ZOOM,
  parseCanvasBackgroundPattern,
  shouldRenderCanvasPattern,
} from "./canvas-background-pattern.ts";

test("stored background pattern defaults to dots and accepts plain, dots, and grid", () => {
  assert.equal(CANVAS_BACKGROUND_PATTERN_STORAGE_KEY, "notespace.canvas.backgroundPattern");
  assert.equal(parseCanvasBackgroundPattern(null), "dots");
  assert.equal(parseCanvasBackgroundPattern(undefined), "dots");
  assert.equal(parseCanvasBackgroundPattern("stripes"), "dots");
  assert.deepEqual(
    CANVAS_BACKGROUND_PATTERNS.map(({ pattern, label }) => [pattern, label]),
    [
      ["none", "Plain"],
      ["dots", "Dots"],
      ["grid", "Grid"],
    ],
  );
  for (const { pattern } of CANVAS_BACKGROUND_PATTERNS) {
    assert.equal(parseCanvasBackgroundPattern(pattern), pattern);
  }
});

test("background pattern renders only for visible dots or grid above minimum zoom", () => {
  assert.equal(shouldRenderCanvasPattern("none", 1, false), false);
  assert.equal(shouldRenderCanvasPattern("dots", 1, true), false);
  assert.equal(shouldRenderCanvasPattern("grid", 1, true), false);
  assert.equal(shouldRenderCanvasPattern("dots", CANVAS_PATTERN_MIN_ZOOM - 0.01, false), false);
  assert.equal(shouldRenderCanvasPattern("grid", Number.NaN, false), false);
  assert.equal(shouldRenderCanvasPattern("dots", CANVAS_PATTERN_MIN_ZOOM, false), true);
  assert.equal(shouldRenderCanvasPattern("grid", 1, false), true);
});
