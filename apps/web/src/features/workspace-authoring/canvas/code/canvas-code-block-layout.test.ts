import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_BLOCK_DEFAULT_WIDTH,
  CODE_BLOCK_BODY_PADDING_Y,
  CODE_BLOCK_BORDER_ALLOWANCE,
  CODE_BLOCK_LINE_HEIGHT,
  CODE_BLOCK_LINE_NUMBER_WIDTH,
  codeBlockContentWidth,
  codeElementContainsClientPoint,
  codeBlockOutputLayout,
  codeBlockHeightChanged,
  codeBlockIntersectsViewport,
  codeBlockMinimumHeight,
  shouldSwitchCodeBlockToManualHeight,
} from "./canvas-code-block-layout.ts";

test("code hit testing uses scrolled/zoomed surface coordinates and inclusive edges", () => {
  const element = { x: 100, y: 50, width: 100, height: 50, angle: 0 };
  const viewport = { zoom: 2, scrollX: 10, scrollY: -5 };
  const surface = { left: 20, top: 30 };
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 240, 120), true);
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 440, 220), true);
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 239, 120), false);
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 440, 221), false);
});

test("code hit testing unrotates around the rendered center rather than the bounding box", () => {
  const element = { x: 0, y: 0, width: 100, height: 40, angle: Math.PI / 2 };
  const viewport = { zoom: 1, scrollX: 0, scrollY: 0 };
  const surface = { left: 0, top: 0 };
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 50, -20), true);
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 10, 20), false);
  assert.equal(codeElementContainsClientPoint(element, viewport, surface, 50, 71), false);
});

test("one-line code blocks start compact and line numbers reserve body width", () => {
  const minimum = codeBlockMinimumHeight();
  assert.ok(minimum > 0 && minimum < 80);
  assert.equal(
    minimum,
    CODE_BLOCK_LINE_HEIGHT + (CODE_BLOCK_BODY_PADDING_Y * 2) + CODE_BLOCK_BORDER_ALLOWANCE,
  );
  assert.equal(CODE_BLOCK_DEFAULT_WIDTH, 360);
  assert.equal(
    codeBlockContentWidth(CODE_BLOCK_DEFAULT_WIDTH, true),
    codeBlockContentWidth(CODE_BLOCK_DEFAULT_WIDTH, false) - CODE_BLOCK_LINE_NUMBER_WIDTH,
  );
});

test("output follows rendered card width, not viewport or scene width", () => {
  assert.equal(codeBlockOutputLayout(559), "stack");
  assert.equal(codeBlockOutputLayout(560), "split");
  assert.equal(codeBlockOutputLayout(360 * 2), "split");
  assert.equal(codeBlockOutputLayout(720 * 0.5), "stack");
});

test("manual vertical resize disables auto height but acknowledged auto-fit does not", () => {
  const minimum = codeBlockMinimumHeight();
  assert.equal(shouldSwitchCodeBlockToManualHeight({
    heightMode: "auto",
    previousHeight: minimum,
    currentHeight: minimum + 45,
    expectedAutoFitHeight: undefined,
  }), true);

  assert.equal(shouldSwitchCodeBlockToManualHeight({
    heightMode: "auto",
    previousHeight: minimum,
    currentHeight: minimum + 45,
    expectedAutoFitHeight: minimum + 45,
  }), false);

  assert.equal(shouldSwitchCodeBlockToManualHeight({
    heightMode: "manual",
    previousHeight: minimum,
    currentHeight: minimum + 45,
    expectedAutoFitHeight: undefined,
  }), false);
});

test("tiny floating-point height changes are ignored", () => {
  assert.equal(codeBlockHeightChanged(40, 40.4), false);
  assert.equal(codeBlockHeightChanged(40, 41), true);
});

test("code block viewport bounds include rotation and a small render overscan", () => {
  const viewport = {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    viewportWidth: 800,
    viewportHeight: 600,
  };
  assert.equal(codeBlockIntersectsViewport({ ...viewport, x: 1_000, y: 1_000, width: 100, height: 100, angle: 0 }), false);
  assert.equal(codeBlockIntersectsViewport({ ...viewport, x: -120, y: 100, width: 100, height: 100, angle: 0 }), true);
  assert.equal(codeBlockIntersectsViewport({ ...viewport, x: -100, y: 0, width: 100, height: 100, angle: Math.PI / 4 }), true);
  assert.equal(codeBlockIntersectsViewport({ ...viewport, viewportWidth: 0, x: 1_000, y: 1_000, width: 100, height: 100, angle: 0 }), true);
});
