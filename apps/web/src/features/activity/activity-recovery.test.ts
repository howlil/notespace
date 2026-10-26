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

function withFakeStorage(run: (
  values: Map<string, string>,
  onNextWrite: (callback: (key: string) => void) => void,
  onNextRemove: (callback: (key: string) => void) => void,
) => void) {
  const values = new Map<string, string>();
  let onWrite: ((key: string) => void) | undefined;
  let onRemove: ((key: string) => void) | undefined;
  const onNextWrite = (callback: (key: string) => void) => { onWrite = callback; };
  const onNextRemove = (callback: (key: string) => void) => { onRemove = callback; };
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
        removeItem: (key: string) => {
          const callback = onRemove;
          onRemove = undefined;
          callback?.(key);
          values.delete(key);
        },
      },
      dispatchEvent: () => true,
    },
  });
  try {
    run(values, onNextWrite, onNextRemove);
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
    assert.equal([...values.keys()].filter((key) => key.startsWith("notespace.activity-finalization:v3:")).length, 2);
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

test("same-session interleaved writes preserve the longer recovery record", () => {
  withFakeStorage((values, onNextWrite) => {
    onNextWrite(() => {
      // Tab B commits the 45-second record after Tab A has begun enqueueing 12s.
      assert.equal(enqueueActivityFinalization(finalization("same:2026-10-26", 45)), true);
    });
    assert.equal(enqueueActivityFinalization(finalization("same:2026-10-26", 12)), true);
    const keyPrefix = "notespace.activity-finalization:v3:";
    assert.equal([...values.keys()].filter((key) => key.startsWith(keyPrefix)).length, 2);
    assert.deepEqual(readActivityRecovery().finalizations, [finalization("same:2026-10-26", 45)]);
  });
});

test("stale HTTP acknowledgement cannot remove a concurrent same-session enqueue", () => {
  withFakeStorage((values, _, onNextRemove) => {
    const earlier = finalization("same:2026-10-26", 12);
    const newer = finalization("same:2026-10-26", 45);
    enqueueActivityFinalization(earlier);
    onNextRemove(() => {
      // Tab B writes while Tab A acknowledges its earlier 12-second PUT.
      assert.equal(enqueueActivityFinalization(newer), true);
    });
    assert.equal(acknowledgeActivityFinalization(earlier), true);
    assert.deepEqual(readActivityRecovery().finalizations, [newer]);
    assert.equal(acknowledgeActivityFinalization(newer), true);
    assert.deepEqual(readActivityRecovery().finalizations, []);
    assert.equal([...values.keys()].filter((key) => key.startsWith("notespace.activity-finalization:v3:")).length, 0);
  });
});

test("acknowledging the longest confirmed attempt discards older duplicate records", () => {
  withFakeStorage(() => {
    const old = finalization("same:2026-10-26", 15);
    const latest = finalization("same:2026-10-26", 45);
    enqueueActivityFinalization(old);
    enqueueActivityFinalization(latest);
    enqueueActivityFinalization(latest);
    assert.equal(acknowledgeActivityFinalization(latest), true);
    assert.deepEqual(readActivityRecovery().finalizations, []);
  });
});

test("legacy v2 recovery remains readable and can be acknowledged after upgrading", () => {
  withFakeStorage((values) => {
    const legacy = finalization("legacy:2026-10-26", 17);
    const legacyKey = "notespace.activity-finalization:v2:legacy%3A2026-10-26";
    values.set(legacyKey, JSON.stringify(legacy));
    assert.deepEqual(readActivityRecovery().finalizations, [legacy]);
    enqueueActivityFinalization(finalization("legacy:2026-10-26", 26));
    assert.deepEqual(readActivityRecovery().finalizations, [finalization("legacy:2026-10-26", 26)]);
    assert.equal(acknowledgeActivityFinalization(finalization("legacy:2026-10-26", 26)), true);
    assert.deepEqual(readActivityRecovery().finalizations, []);
  });
});

test("deleted activity discards v3 attempts across days without deleting other sessions", () => {
  withFakeStorage(() => {
    enqueueActivityFinalization(finalization("delete-me:2026-10-25", 11));
    enqueueActivityFinalization(finalization("delete-me:2026-10-26", 22));
    enqueueActivityFinalization(finalization("keep-me:2026-10-26", 33));
    assert.equal(discardDeletedActivitySession("delete-me"), true);
    assert.deepEqual(readActivityRecovery().finalizations, [finalization("keep-me:2026-10-26", 33)]);
  });
});

test("repeated identical pending finalizations reuse one durable attempt", () => {
  withFakeStorage((values) => {
    const pending = finalization("rollover:2026-10-25", 30);
    assert.equal(enqueueActivityFinalization(pending), true);
    for (let i = 0; i < 50; i++) assert.equal(enqueueActivityFinalization(pending), true);
    assert.equal([...values.keys()].filter((key) =>
      key.startsWith("notespace.activity-finalization:v3:")).length, 1);
    assert.deepEqual(readActivityRecovery().finalizations, [pending]);
  });
});

test("a stale equal-duration HTTP success must not display an old task handoff", () => {
  withFakeStorage(() => {
    const old = finalization("same:2026-10-26", 42, "task-old");
    const newer = finalization("same:2026-10-26", 42, "task-new");
    enqueueActivityFinalization(old);
    enqueueActivityFinalization(newer);
    // The latest winner keeps the old handoff from being surfaced even on
    // an equal duration when the payload differs.
    assert.equal(acknowledgeActivityFinalization(old), true);
    assert.deepEqual(readActivityRecovery().handoffTaskIds, []);
    assert.deepEqual(readActivityRecovery().finalizations, [newer]);
  });
});


test("winning equal-duration ACK retires obsolete metadata variants", () => {
  withFakeStorage(() => {
    const old = finalization("same:2026-10-26", 15);
    const newest = { ...old, heartbeat: { ...old.heartbeat, title: "Updated context" } };
    enqueueActivityFinalization(old);
    enqueueActivityFinalization(newest);
    assert.deepEqual(readActivityRecovery().finalizations, [newest]);
    assert.equal(acknowledgeActivityFinalization(newest), true);
    assert.deepEqual(readActivityRecovery().finalizations, []);
  });
});

test("winning task handoff retires superseded same-duration task attempts", () => {
  withFakeStorage(() => {
    const old = finalization("same:2026-10-26", 30, "task-old");
    const newest = finalization("same:2026-10-26", 30, "task-new");
    enqueueActivityFinalization(old);
    enqueueActivityFinalization(newest);
    assert.equal(acknowledgeActivityFinalization(newest), true);
    assert.deepEqual(readActivityRecovery(), { finalizations: [], handoffTaskIds: ["task-new"] });
  });
});


test("equal-duration winners are stable when storage enumeration order is reversed", () => {
  withFakeStorage((values) => {
    const old = finalization("same:2026-10-26", 20, "task-old");
    const latest = finalization("same:2026-10-26", 20, "task-new");
    enqueueActivityFinalization(old);
    enqueueActivityFinalization(latest);
    assert.deepEqual(readActivityRecovery().finalizations, [latest]);
    Object.defineProperty(window.localStorage, "key", {
      configurable: true,
      value: (index: number) => [...values.keys()].reverse()[index] ?? null,
    });
    assert.deepEqual(readActivityRecovery().finalizations, [latest]);
    assert.equal(acknowledgeActivityFinalization(old), true);
    assert.deepEqual(readActivityRecovery().finalizations, [latest]);
    assert.equal(acknowledgeActivityFinalization(latest), true);
    assert.deepEqual(readActivityRecovery().finalizations, []);
  });
});

test("shorter repeated retries do not accumulate behind a longer pending attempt", () => {
  withFakeStorage((values) => {
    enqueueActivityFinalization(finalization("same:2026-10-26", 45));
    for (let i = 0; i < 50; i++) {
      assert.equal(enqueueActivityFinalization(finalization("same:2026-10-26", 15)), true);
    }
    assert.equal([...values.keys()].filter((key) =>
      key.startsWith("notespace.activity-finalization:v3:")).length, 2);
    assert.deepEqual(readActivityRecovery().finalizations, [finalization("same:2026-10-26", 45)]);
  });
});
