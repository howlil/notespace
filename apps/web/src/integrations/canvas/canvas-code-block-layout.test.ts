import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_BLOCK_DEFAULT_WIDTH,
  CODE_BLOCK_LINE_NUMBER_WIDTH,
  codeBlockContentWidth,
  codeBlockHeightChanged,
  codeBlockMinimumHeight,
  shouldSwitchCodeBlockToManualHeight,
} from "./canvas-code-block-layout.ts";

test("one-line code blocks start compact and line numbers reserve body width", () => {
  const minimum = codeBlockMinimumHeight();
  assert.ok(minimum > 0 && minimum < 80);
  assert.equal(CODE_BLOCK_DEFAULT_WIDTH, 360);
  assert.equal(
    codeBlockContentWidth(CODE_BLOCK_DEFAULT_WIDTH, true),
    codeBlockContentWidth(CODE_BLOCK_DEFAULT_WIDTH, false) - CODE_BLOCK_LINE_NUMBER_WIDTH,
  );
});

test("manual vertical resize disables auto height but acknowledged auto-fit does not", () => {
  assert.equal(shouldSwitchCodeBlockToManualHeight({
    heightMode: "auto",
    previousHeight: 35,
    currentHeight: 80,
    expectedAutoFitHeight: undefined,
  }), true);

  assert.equal(shouldSwitchCodeBlockToManualHeight({
    heightMode: "auto",
    previousHeight: 35,
    currentHeight: 80,
    expectedAutoFitHeight: 80,
  }), false);

  assert.equal(shouldSwitchCodeBlockToManualHeight({
    heightMode: "manual",
    previousHeight: 35,
    currentHeight: 80,
    expectedAutoFitHeight: undefined,
  }), false);
});

test("tiny floating-point height changes are ignored", () => {
  assert.equal(codeBlockHeightChanged(40, 40.4), false);
  assert.equal(codeBlockHeightChanged(40, 41), true);
});
