import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgeActivityFinalization,
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
