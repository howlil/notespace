import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgeActivityFinalization,
  discardDeletedActivitySession,
  enqueueActivityFinalization,
  readActivityRecovery,
  removeActivityHandoff,
} from "./activity-recovery.ts";
import type { PendingActivityFinalization } from "./activity-recovery.ts";

function withFakeStorage(run: () => void) {
  const values = new Map<string, string>();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

function finalization(sessionId: string, activeSeconds: number, handoffTaskId?: string): PendingActivityFinalization {
  return {
    sessionId,
    heartbeat: {
      activityDate: "2026-09-22",
      activeSeconds,
      finish: true,
      title: "Durable activity",
      activityType: "build",
      ...(handoffTaskId ? { taskId: handoffTaskId, taskTitleSnapshot: "Durable task" } : {}),
    },
    ...(handoffTaskId ? { handoffTaskId } : {}),
  };
}

test("activity recovery keeps independent finalizations and dedupes acknowledgements", () => {
  withFakeStorage(() => {
    assert.equal(enqueueActivityFinalization(finalization("session-a", 10, "task-a")), true);
    assert.equal(enqueueActivityFinalization(finalization("session-b", 20)), true);
    assert.equal(enqueueActivityFinalization(finalization("session-a", 15, "task-a")), true);

    let state = readActivityRecovery();
    assert.deepEqual(
      state.finalizations.map((item) => [item.sessionId, item.heartbeat.activeSeconds]),
      [["session-b", 20], ["session-a", 15]],
    );

    assert.equal(acknowledgeActivityFinalization("session-a", "task-a"), true);
    assert.equal(acknowledgeActivityFinalization("session-a", "task-a"), true);
    state = readActivityRecovery();
    assert.deepEqual(state.finalizations.map((item) => item.sessionId), ["session-b"]);
    assert.deepEqual(state.handoffTaskIds, ["task-a"]);

    assert.equal(acknowledgeActivityFinalization("session-b"), true);
    assert.equal(removeActivityHandoff("task-a"), true);
    assert.deepEqual(readActivityRecovery(), { finalizations: [], handoffTaskIds: [] });
  });
});

test("deleted activity discards all pending day segments without clearing other sessions", () => {
  withFakeStorage(() => {
    assert.equal(enqueueActivityFinalization(finalization("removed:2026-10-25", 60, "task-1")), true);
    assert.equal(enqueueActivityFinalization(finalization("kept:2026-10-26", 120, "task-2")), true);
    assert.equal(enqueueActivityFinalization(finalization("removed:2026-10-26", 90, "task-1")), true);

    assert.equal(discardDeletedActivitySession("removed"), true);
    assert.deepEqual(
      readActivityRecovery().finalizations.map((item) => item.sessionId),
      ["kept:2026-10-26"],
    );
    assert.deepEqual(readActivityRecovery().handoffTaskIds, []);

    // A late success response for a request sent before deletion must
    // never regenerate a Task handoff after its outbox entry was discarded.
    assert.equal(acknowledgeActivityFinalization("removed:2026-10-26", "task-1"), true);
    assert.deepEqual(readActivityRecovery().handoffTaskIds, []);

    assert.equal(acknowledgeActivityFinalization("kept:2026-10-26", "task-2"), true);
    assert.deepEqual(readActivityRecovery().handoffTaskIds, ["task-2"]);
  });
});

test("deleted Activity can be dropped from recovery by a rejected segment ID", () => {
  withFakeStorage(() => {
    assert.equal(enqueueActivityFinalization(finalization("removed:2026-10-25", 60)), true);
    assert.equal(enqueueActivityFinalization(finalization("removed:2026-10-26", 90)), true);
    assert.equal(discardDeletedActivitySession("removed:2026-10-25"), true);
    assert.deepEqual(readActivityRecovery(), { finalizations: [], handoffTaskIds: [] });
  });
});
