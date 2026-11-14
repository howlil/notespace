import assert from "node:assert/strict";
import test from "node:test";
import { settleDetachedNoteFlushes, trackDetachedNoteFlush } from "./detached-note-flushes.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("settle reports saved when nothing is in flight", async () => {
  assert.equal(await settleDetachedNoteFlushes(), true);
});

test("settle waits for a tracked draft flush before reporting saved", async () => {
  let finish!: () => void;
  trackDetachedNoteFlush(new Promise<void>((resolve) => { finish = resolve; }));
  let settled = false;
  const result = settleDetachedNoteFlushes().then((value) => { settled = true; return value; });
  await settle();
  assert.equal(settled, false);
  finish();
  assert.equal(await result, true);
});

test("settle reports not saved when a tracked draft flush fails", async () => {
  trackDetachedNoteFlush(Promise.reject(new Error("PUT failed")));
  trackDetachedNoteFlush(Promise.resolve());
  assert.equal(await settleDetachedNoteFlushes(), false);
});

test("settle clears the tracker so a failed flush does not poison the next leave", async () => {
  assert.equal(await settleDetachedNoteFlushes(), true);
});
