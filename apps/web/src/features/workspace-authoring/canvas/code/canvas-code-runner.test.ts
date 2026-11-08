import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { currentCodeRuns } from "./execution/use-code-runner.ts";
import {
  CODE_RUNNER_WORKER_CSP,
  CODE_RUNNER_WORKER_URL,
  DEFAULT_CODE_RUN_TIMEOUT_MS,
  MAX_CODE_RUN_OUTPUT_CHARS,
  MAX_CODE_RUN_OUTPUT_LINES,
  MAX_CODE_RUN_OUTPUT_LINE_CHARS,
  canRunCanvasCode,
  createCodeRunOutputBuffer,
  parseWorkerMessage,
} from "./canvas-code-runner.ts";

const workerSource = readFileSync(new URL("../../../../../public/code-runner-worker.js", import.meta.url), "utf8");

test("local runner is intentionally scoped to JavaScript", () => {
  assert.equal(canRunCanvasCode("javascript"), true);
  assert.equal(canRunCanvasCode("js"), true);
  assert.equal(canRunCanvasCode("typescript"), false);
  assert.equal(canRunCanvasCode("python"), false);
});

test("runner worker is a same-origin script with a restrictive response policy", () => {
  assert.equal(DEFAULT_CODE_RUN_TIMEOUT_MS, 2_000);
  assert.equal(CODE_RUNNER_WORKER_URL, "/code-runner-worker.js");
  assert.match(CODE_RUNNER_WORKER_CSP, /connect-src 'none'/);
  assert.match(CODE_RUNNER_WORKER_CSP, /worker-src 'none'/);
  assert.match(workerSource, /new AsyncFunction/);
  assert.match(workerSource, /self\.importScripts/);
});

test("worker message parser rejects malformed payloads and bounds string fields", () => {
  assert.equal(parseWorkerMessage(null), null);
  assert.equal(parseWorkerMessage([]), null);
  assert.equal(parseWorkerMessage({ type: "stdout", text: { invalid: true } }), null);
  assert.equal(parseWorkerMessage({ type: "unknown", text: "ignored" }), null);
  assert.equal(parseWorkerMessage({ type: "done", result: 42 }), null);
  assert.equal(parseWorkerMessage({ type: "error", error: null }), null);
  assert.equal(parseWorkerMessage({ type: "stdout", text: "x".repeat(MAX_CODE_RUN_OUTPUT_LINE_CHARS + 10) })?.type, "stdout");
  assert.equal((parseWorkerMessage({ type: "done", result: "x".repeat(MAX_CODE_RUN_OUTPUT_LINE_CHARS + 10) }) as { result?: string }).result?.length, MAX_CODE_RUN_OUTPUT_LINE_CHARS);
});

test("parent-side output buffer caps hostile worker messages across both streams", () => {
  assert.equal(MAX_CODE_RUN_OUTPUT_LINES, 100);
  const output = createCodeRunOutputBuffer();
  for (let index = 0; index < 150; index += 1) {
    output.append(index % 2 === 0 ? "stdout" : "stderr", "x".repeat(MAX_CODE_RUN_OUTPUT_LINE_CHARS));
  }
  const lines = [...output.stdout, ...output.stderr];
  assert.ok(lines.length <= MAX_CODE_RUN_OUTPUT_LINES);
  assert.ok(output.stderr.includes("[output truncated]"));
  assert.ok(lines.reduce((total, line) => total + line.length, 0) <= MAX_CODE_RUN_OUTPUT_CHARS);
});

test("code output is visible only for the exact current source and language", () => {
  const completed = {
    code: "console.log('version B')",
    language: "javascript",
  };
  const entry = {
    source: completed,
    view: { status: "success" as const, stdout: ["version B"], stderr: [], durationMs: 1 },
  };
  assert.deepEqual(currentCodeRuns({ block: entry }, new Map([[
    "block",
    { code: "console.log('version A')", language: "javascript" },
  ]])), {});
  assert.deepEqual(currentCodeRuns({ block: entry }, new Map([["block", completed]])), { block: entry.view });
  assert.deepEqual(currentCodeRuns({ block: entry }, new Map([[
    "block",
    { code: completed.code, language: "typescript" },
  ]])), {});
});
