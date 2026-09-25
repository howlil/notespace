import assert from "node:assert/strict";
import test from "node:test";
import {
  activityHeartbeatFor,
  activitySessionStorageKey,
  hasLegacyStoredActivitySession,
  legacyActivitySessionStorageKey,
  readStoredActivitySession,
  writeStoredActivitySession,
  type ActivitySessionStorage,
} from "./activity-session-storage.ts";
import type { ManualActivitySession } from "./activity-timer.ts";

function storage(seed: Record<string, string> = {}, writeResult = true) {
  const values = new Map(Object.entries(seed));
  const removed: string[] = [];
  const writes: Array<{ key: string; value: string }> = [];
  const api: ActivitySessionStorage = {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => {
      writes.push({ key, value });
      if (writeResult) values.set(key, value);
      return writeResult;
    },
    remove: (key) => {
      removed.push(key);
      values.delete(key);
    },
  };
  return { api, values, removed, writes };
}

function session(overrides: Partial<ManualActivitySession> = {}): ManualActivitySession {
  return {
    logicalSessionId: "logical-1",
    segmentId: "logical-1:2026-09-25",
    activityDate: "2026-09-25",
    status: "running",
    sessionAccumulatedSeconds: 10,
    segmentAccumulatedSeconds: 5,
    runningSince: 1000,
    baselineTodaySeconds: 20,
    baselineTotalSeconds: 30,
    context: { title: "Learn", activityType: "learn" },
    ...overrides,
  };
}

test("activity storage restores a valid current session and backfills legacy logical identity", () => {
  const value = session({ logicalSessionId: "" });
  const { api } = storage({
    [activitySessionStorageKey]: JSON.stringify(value),
  });

  const restored = readStoredActivitySession(undefined, api);

  assert.ok(restored);
  assert.equal(restored.logicalSessionId, "logical-1");
  assert.equal(restored.context?.title, "Learn");
});

test("activity storage rejects malformed or incomplete current sessions", () => {
  assert.equal(
    readStoredActivitySession(undefined, storage({ [activitySessionStorageKey]: "{" }).api),
    null,
  );
  assert.equal(
    readStoredActivitySession(undefined, storage({
      [activitySessionStorageKey]: JSON.stringify({ segmentId: "missing-fields" }),
    }).api),
    null,
  );
});

test("activity storage migrates a valid legacy workspace session to the current key", () => {
  const legacyKey = legacyActivitySessionStorageKey("workspace-1");
  const legacy = session({ context: undefined, logicalSessionId: "" });
  const state = storage({ [legacyKey]: JSON.stringify(legacy) });

  const restored = readStoredActivitySession({
    title: "Workspace timer",
    activityType: "build",
    workspaceId: "workspace-1",
    workspaceTitleSnapshot: "Workspace",
  }, state.api);

  assert.ok(restored);
  assert.equal(restored.logicalSessionId, "logical-1");
  assert.equal(restored.context?.workspaceId, "workspace-1");
  assert.equal(state.values.has(activitySessionStorageKey), true);
  assert.equal(state.removed.includes(legacyKey), true);
});

test("legacy activity storage is retained when migration persistence fails", () => {
  const legacyKey = legacyActivitySessionStorageKey("workspace-1");
  const state = storage({
    [legacyKey]: JSON.stringify(session({ context: undefined })),
  }, false);

  const restored = readStoredActivitySession({
    title: "Workspace timer",
    activityType: "build",
    workspaceId: "workspace-1",
  }, state.api);

  assert.ok(restored);
  assert.equal(state.values.has(legacyKey), true);
  assert.equal(state.removed.includes(legacyKey), false);
});

test("activity storage writes, clears, and detects legacy state through one boundary", () => {
  const state = storage();
  const value = session();

  assert.equal(writeStoredActivitySession(value, state.api), true);
  assert.deepEqual(JSON.parse(state.values.get(activitySessionStorageKey) ?? "{}"), value);

  const legacyKey = legacyActivitySessionStorageKey("workspace-1");
  state.values.set(legacyKey, JSON.stringify(value));
  assert.equal(hasLegacyStoredActivitySession("workspace-1", state.api), true);

  writeStoredActivitySession(null, state.api);
  assert.equal(state.values.has(activitySessionStorageKey), false);
});

test("activity heartbeat mapping preserves standalone and linked context", () => {
  assert.deepEqual(
    activityHeartbeatFor({ title: "Standalone", activityType: "build" }, "2026-09-25", 42, false),
    {
      activityDate: "2026-09-25",
      activeSeconds: 42,
      finish: false,
      title: "Standalone",
      activityType: "build",
    },
  );

  assert.deepEqual(
    activityHeartbeatFor({
      title: "Task",
      activityType: "learn",
      workspaceId: "workspace-1",
      workspaceTitleSnapshot: "Workspace",
      taskId: "task-1",
      taskTitleSnapshot: "Task",
    }, "2026-09-25", 99, true),
    {
      activityDate: "2026-09-25",
      activeSeconds: 99,
      finish: true,
      title: "Task",
      activityType: "learn",
      workspaceId: "workspace-1",
      workspaceTitleSnapshot: "Workspace",
      taskId: "task-1",
      taskTitleSnapshot: "Task",
    },
  );
});
