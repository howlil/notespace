import assert from "node:assert/strict";
import test from "node:test";
import {
  acknowledgeActivityFinalization,
  canFlushActivityFinalization,
  discardDeletedActivitySession,
  enqueueActivityFinalization,
  readActivityRecovery,
  removeActivityHandoff,
} from "./activity-recovery.ts";
import type { PendingActivityFinalization } from "./activity-recovery.ts";

function withFakeStorage(run: (values: Map<string, string>, onNextWrite: (callback: (key: string) => void) => void) => void) {
  const values = new Map<string, string>();
  let onWrite: ((key: string) => void) | undefined;
  const onNextWrite = (callback: (key: string) => void) => { onWrite = callback; };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        get length() { return values.size; },
        key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          const callback = onWrite;
          onWrite = undefined;
          callback?.(key);
          values.set(key, value);
        },
        removeItem: (key: string) => { values.delete(key); },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run(values, onNextWrite);
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
      [["session-a", 15], ["session-b", 20]],
    );

    assert.equal(acknowledgeActivityFinalization(finalization("session-a", 15, "task-a")), true);
    assert.equal(acknowledgeActivityFinalization(finalization("session-a", 15, "task-a")), true);
    state = readActivityRecovery();
    assert.deepEqual(state.finalizations.map((item) => item.sessionId), ["session-b"]);
    assert.deepEqual(state.handoffTaskIds, ["task-a"]);

    assert.equal(acknowledgeActivityFinalization(finalization("session-b", 20)), true);
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
    assert.equal(acknowledgeActivityFinalization(finalization("removed:2026-10-26", 90, "task-1")), true);
    assert.deepEqual(readActivityRecovery().handoffTaskIds, []);

    assert.equal(acknowledgeActivityFinalization(finalization("kept:2026-10-26", 120, "task-2")), true);
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

test("late success cannot discard a newer finalization for the same session", () => {
  withFakeStorage(() => {
    const oldRequest = finalization("session-a", 10, "task-old");
    const latest = finalization("session-a", 20, "task-new");
    assert.equal(enqueueActivityFinalization(oldRequest), true);
    // The other tab updates the pending segment while the old PUT is in flight.
    assert.equal(enqueueActivityFinalization(latest), true);
    assert.equal(acknowledgeActivityFinalization(oldRequest), true);
    assert.deepEqual(readActivityRecovery(), {
      finalizations: [latest], handoffTaskIds: [],
    });
    assert.equal(acknowledgeActivityFinalization(latest), true);
    assert.deepEqual(readActivityRecovery(), {
      finalizations: [], handoffTaskIds: ["task-new"],
    });
  });
});

test("acknowledgement distinguishes other updated heartbeat fields at the same duration", () => {
  withFakeStorage(() => {
    const previous = finalization("session-a", 15);
    const changed = { ...previous, heartbeat: { ...previous.heartbeat, title: "Updated context" } };
    enqueueActivityFinalization(previous);
    enqueueActivityFinalization(changed);
    acknowledgeActivityFinalization(previous);
    assert.deepEqual(readActivityRecovery().finalizations, [changed]);
  });
});

test("independent tab writes to separate sessions cannot overwrite a queued finalization", () => {
  withFakeStorage((values, onNextWrite) => {
    onNextWrite(() => {
      // Simulate a second tab writing between the first tab's read and
      // localStorage setItem. A single shared JSON key loses one update here.
      assert.equal(enqueueActivityFinalization(finalization("other-tab", 21)), true);
    });
    assert.equal(enqueueActivityFinalization(finalization("first-tab", 10)), true);
    assert.deepEqual(readActivityRecovery().finalizations.map((item) => item.sessionId).sort(),
      ["first-tab", "other-tab"]);
    assert.equal([...values.keys()].filter((key) => key.startsWith("notespace.activity-finalization:v2:")).length, 2);
  });
});

test("existing v1 recovery migrates without losing pending finalizations or handoffs", () => {
  withFakeStorage((values) => {
    values.set("notespace.activity-recovery:v1", JSON.stringify({
      finalizations: [finalization("legacy", 90, "old-task")],
      handoffTaskIds: ["pending-task"],
    }));
    assert.deepEqual(readActivityRecovery(), {
      finalizations: [finalization("legacy", 90, "old-task")],
      handoffTaskIds: ["pending-task"],
    });
    assert.equal(values.has("notespace.activity-recovery:v1"), false);
    assert.equal(acknowledgeActivityFinalization(finalization("legacy", 90, "old-task")), true);
    assert.deepEqual(readActivityRecovery().handoffTaskIds.sort(), ["old-task", "pending-task"]);
  });
});

test("a shorter delayed finalization cannot overwrite a longer pending heartbeat", () => {
  withFakeStorage(() => {
    enqueueActivityFinalization(finalization("same", 35));
    enqueueActivityFinalization(finalization("same", 12));
    assert.deepEqual(readActivityRecovery().finalizations, [finalization("same", 35)]);
  });
});

test("an End finalization cannot leave outbox while its live session snapshot remains", () => {
  withFakeStorage((values) => {
    const pending = { ...finalization("active:2026-10-26", 42), endSession: true as const };
    values.set("notespace.activity-session", JSON.stringify({
      logicalSessionId: "active", segmentId: "active:2026-10-26",
      status: "running", activityDate: "2026-10-26",
    }));
    assert.equal(enqueueActivityFinalization(pending), true);
    assert.equal(canFlushActivityFinalization(pending), false);

    // A different newly started Activity must not block the old finished one.
    values.set("notespace.activity-session", JSON.stringify({
      logicalSessionId: "new", segmentId: "new:2026-10-26", status: "running",
    }));
    assert.equal(canFlushActivityFinalization(pending), true);
  });
});

test("finalization after End may flush only once its snapshot was removed or tombstoned", () => {
  withFakeStorage((values) => {
    const pending = { ...finalization("active:2026-10-26", 42), endSession: true as const };
    values.set("notespace.activity-session", "{bad json");
    assert.equal(canFlushActivityFinalization(pending), false);
    values.set("notespace.activity-session", "null");
    assert.equal(canFlushActivityFinalization(pending), true);
    values.delete("notespace.activity-session");
    assert.equal(canFlushActivityFinalization(pending), true);
    assert.equal(canFlushActivityFinalization(finalization("rolled-over:2026-10-25", 10)), true);
  });
});
