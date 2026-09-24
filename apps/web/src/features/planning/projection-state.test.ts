import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyInboxTaskUpdate,
  applyTodayTaskUpdate,
  belongsToInbox,
  belongsToToday,
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
