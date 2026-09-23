import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CODE_RUN_TIMEOUT_MS,
  MAX_CODE_RUN_OUTPUT_LINES,
  canRunCanvasCode,
  javascriptWorkerSource,
} from "./canvas-code-runner.ts";

test("local runner is intentionally scoped to JavaScript", () => {
  assert.equal(canRunCanvasCode("javascript"), true);
  assert.equal(canRunCanvasCode("js"), true);
  assert.equal(canRunCanvasCode("typescript"), false);
  assert.equal(canRunCanvasCode("python"), false);
});

test("worker runner has finite execution and output budgets", () => {
  assert.equal(DEFAULT_CODE_RUN_TIMEOUT_MS, 2_000);
  assert.equal(MAX_CODE_RUN_OUTPUT_LINES, 100);
  const source = javascriptWorkerSource();
  assert.match(source, /MAX_LINES = 100/);
  assert.match(source, /output truncated/);
});

test("worker runner blocks ordinary browser network APIs before user code executes", () => {
  const source = javascriptWorkerSource();
  assert.match(source, /self\.fetch = \(\) => Promise\.reject/);
  assert.match(source, /self\.XMLHttpRequest = undefined/);
  assert.match(source, /self\.WebSocket = undefined/);
  assert.match(source, /self\.EventSource = undefined/);
  assert.match(source, /self\.importScripts/);
  assert.match(source, /new AsyncFunction/);
});
