import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentSnapshotSession } from "./document-snapshot-session-core.ts";

type TimerHandle = ReturnType<typeof setTimeout>;

function scheduler() {
  let callback: (() => void) | null = null;
  let scheduled = 0;
  let cleared = 0;
  return {
    setTimer(next: () => void) {
      callback = next;
      scheduled += 1;
      return scheduled as unknown as TimerHandle;
    },
    clearTimer() {
      callback = null;
      cleared += 1;
    },
    run() {
      const next = callback;
      callback = null;
      next?.();
    },
    get scheduled() { return scheduled; },
    get cleared() { return cleared; },
  };
}

test("document snapshot session coalesces changes and flushes the latest editor JSON", () => {
  const timer = scheduler();
  const dirty: boolean[] = [];
  const snapshots: unknown[] = [];
  let current: Record<string, unknown> = { type: "doc", version: 1 };

  const session = createDocumentSnapshotSession({
    readSnapshot: () => current,
    onChange: (snapshot) => snapshots.push(snapshot),
    onDirtyChange: (value) => dirty.push(value),
    setTimer: (callback) => timer.setTimer(callback),
    clearTimer: () => timer.clearTimer(),
  });

  session.schedule();
  current = { type: "doc", version: 2 };
  session.schedule();

  assert.equal(timer.scheduled, 1);
  assert.equal(session.hasPending(), true);
  assert.deepEqual(dirty, [true]);

  timer.run();

  assert.equal(session.hasPending(), false);
  assert.deepEqual(dirty, [true, false]);
  assert.deepEqual(snapshots, [{
    format: "tiptap",
    version: 1,
    data: { type: "doc", version: 2 },
  }]);
});

test("manual document snapshot flush cancels the debounce and saves immediately", () => {
  const timer = scheduler();
  const snapshots: unknown[] = [];
  const session = createDocumentSnapshotSession({
    readSnapshot: () => ({ type: "doc", content: [] }),
    onChange: (snapshot) => snapshots.push(snapshot),
    setTimer: (callback) => timer.setTimer(callback),
    clearTimer: () => timer.clearTimer(),
  });

  session.schedule();
  assert.equal(session.flush(), true);

  assert.equal(timer.cleared, 1);
  assert.equal(snapshots.length, 1);
  timer.run();
  assert.equal(snapshots.length, 1);
});

test("document snapshot session keeps pending state when no editor snapshot is available", () => {
  const timer = scheduler();
  const dirty: boolean[] = [];
  const session = createDocumentSnapshotSession({
    readSnapshot: () => null,
    onChange: () => { throw new Error("should not save"); },
    onDirtyChange: (value) => dirty.push(value),
    setTimer: (callback) => timer.setTimer(callback),
    clearTimer: () => timer.clearTimer(),
  });

  session.schedule();
  assert.equal(session.flush(), false);
  assert.equal(session.hasPending(), true);
  assert.deepEqual(dirty, [true]);
});

test("disposing a document snapshot session flushes pending authored state once", () => {
  const snapshots: unknown[] = [];
  const session = createDocumentSnapshotSession({
    readSnapshot: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
    onChange: (snapshot) => snapshots.push(snapshot),
    setTimer: (() => 1 as unknown as TimerHandle),
    clearTimer: () => {},
  });

  session.schedule();
  session.dispose();
  session.dispose();

  assert.equal(snapshots.length, 1);
  assert.equal(session.hasPending(), false);
});
