import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyInboxTaskUpdate,
  applyUnassignedTaskUpdate,
  belongsToUnassigned,
  applyTodayTaskUpdate,
  belongsToInbox,
  belongsToToday,
  removeFromTodayPatch,
} from "./projection-state.ts";
import type { PlanningTask, TodayProjection } from "../../domain/planning/planning.ts";

const task = (overrides: Partial<PlanningTask> = {}): PlanningTask => ({
  id: "task-1",
  title: "Task",
  description: "",
  position: 0,
  plannedFor: "2026-09-24",
  completedAt: null,
  createdAt: "2026-09-24T00:00:00Z",
  updatedAt: "2026-09-24T00:00:00Z",
  version: 1,
  ...overrides,
});

test("belongsToToday mirrors exact-date and incomplete carry-over projection policy", () => {
  assert.equal(belongsToToday(task(), "2026-09-24"), true);
  assert.equal(belongsToToday(task({ plannedFor: "2026-09-23" }), "2026-09-24"), true);
  assert.equal(belongsToToday(task({ plannedFor: "2026-09-23", completedAt: "2026-09-23T12:00:00Z" }), "2026-09-24"), false);
  assert.equal(belongsToToday(task({ plannedFor: undefined }), "2026-09-24"), false);
});

test("Remove from Today clears both exact-date and carried-forward scheduling", () => {
  assert.deepEqual(removeFromTodayPatch(), { plannedFor: "" });
  assert.equal(belongsToToday(task({ plannedFor: "2026-09-24" }), "2026-09-24"), true);
  assert.equal(belongsToToday(task({ plannedFor: "2026-09-23" }), "2026-09-24"), true);
  assert.equal(belongsToToday(task({ ...removeFromTodayPatch() }), "2026-09-24"), false);
});

test("applyTodayTaskUpdate preserves projection context and removes tasks that leave Today", () => {
  const projection: TodayProjection = {
    date: "2026-09-24",
    tasks: [{ ...task(), workspaceTitle: "Workspace", milestoneTitle: "Milestone" }],
  };
  const renamed = applyTodayTaskUpdate(projection, task({ title: "Renamed", version: 2 }));
  assert.equal(renamed.tasks[0]?.title, "Renamed");
  assert.equal(renamed.tasks[0]?.workspaceTitle, "Workspace");

  const removed = applyTodayTaskUpdate(renamed, task({ plannedFor: undefined, version: 3 }));
  assert.deepEqual(removed.tasks, []);
});

test("Inbox projection keeps only incomplete standalone unscheduled tasks", () => {
  assert.equal(belongsToInbox(task({ plannedFor: undefined })), true);
  assert.equal(belongsToInbox(task({ workspaceId: "workspace-1", plannedFor: undefined })), false);
  assert.equal(belongsToInbox(task({ plannedFor: "2026-09-24" })), false);
  assert.equal(belongsToInbox(task({ plannedFor: undefined, completedAt: "2026-09-24T12:00:00Z" })), false);

  const projection = { tasks: [task({ plannedFor: undefined })] };
  assert.equal(applyInboxTaskUpdate(projection, task({ title: "Renamed", plannedFor: undefined, version: 2 })).tasks[0]?.title, "Renamed");
  assert.deepEqual(applyInboxTaskUpdate(projection, task({ plannedFor: "2026-09-24", version: 2 })).tasks, []);
});

test("stale update cannot revert or remove a newer Today task version", () => {
  const current: TodayProjection = { date: "2026-09-24", tasks: [
    { ...task({ version: 5, title: "Latest" }), workspaceTitle: "Owned Workspace" },
  ] };
  const staleEdit = applyTodayTaskUpdate(current, task({ version: 4, title: "Old" }));
  const staleRemoval = applyTodayTaskUpdate(current, task({ version: 4, plannedFor: undefined }));
  assert.deepEqual(staleEdit, current);
  assert.deepEqual(staleRemoval, current);
});

test("unassigned projection keeps scheduled and completed history while removing assigned tasks", () => {
  const scheduled = task({ plannedFor: "2026-10-26", version: 2 });
  const completed = task({ id: "done", plannedFor: undefined, completedAt: "2026-10-25T09:00:00Z" });
  assert.equal(belongsToUnassigned(scheduled), true);
  assert.equal(belongsToUnassigned(completed), true);
  const projection = { tasks: [scheduled, completed] };
  const latest = applyUnassignedTaskUpdate(projection, { ...scheduled, title: "Renamed", version: 3 });
  assert.equal(latest.tasks[0]?.title, "Renamed");
  assert.deepEqual(applyUnassignedTaskUpdate(latest, scheduled), latest);
  assert.deepEqual(applyUnassignedTaskUpdate(latest, { ...scheduled, workspaceId: "w1", version: 4 }).tasks.map(x => x.id), ["done"]);
});
