import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopCloseStore,
  registerDesktopUpdateChecker,
  requestDesktopUpdateCheck,
  resetDesktopCloseStore,
  resetDesktopUpdaterStore,
  setDesktopCloseStatus,
} from "./desktop-store.ts";

test("desktopCloseStore deduplicates identical close states", () => {
  resetDesktopCloseStore();
  let notifications = 0;
  const unsub = desktopCloseStore.subscribe(() => { notifications += 1; });

  try {
    setDesktopCloseStatus("flushing");
    setDesktopCloseStatus("flushing", null);
    assert.equal(notifications, 1);
    assert.deepEqual(desktopCloseStore.getSnapshot(), { state: "flushing", message: null });

    setDesktopCloseStatus("error", "Disk full");
    setDesktopCloseStatus("error", "Disk full");
    assert.equal(notifications, 2);
    assert.deepEqual(desktopCloseStore.getSnapshot(), { state: "error", message: "Disk full" });

    setDesktopCloseStatus("idle");
    assert.equal(notifications, 3);
    assert.deepEqual(desktopCloseStore.getSnapshot(), { state: "idle", message: null });
  } finally {
    unsub();
    resetDesktopCloseStore();
  }
});

test("desktopUpdaterStore invokes registered checker and preserves newer registrations on stale cleanup", () => {
  resetDesktopUpdaterStore();
  const calls: string[] = [];

  try {
    assert.equal(requestDesktopUpdateCheck(), false);

    const unsub1 = registerDesktopUpdateChecker(() => calls.push("first"));
    assert.equal(requestDesktopUpdateCheck(), true);
    assert.deepEqual(calls, ["first"]);

    const unsub2 = registerDesktopUpdateChecker(() => calls.push("second"));
    unsub1();
    assert.equal(requestDesktopUpdateCheck(), true);
    assert.deepEqual(calls, ["first", "second"]);

    unsub2();
    assert.equal(requestDesktopUpdateCheck(), false);
  } finally {
    resetDesktopUpdaterStore();
  }
});
