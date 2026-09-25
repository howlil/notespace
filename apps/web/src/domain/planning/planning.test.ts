import test from "node:test";
import assert from "node:assert/strict";
import { localDateKey, milestoneProgress, tasksForMilestone, type WorkspacePlan } from "./planning.ts";

const plan: WorkspacePlan = {
  workspaceId: "workspace-1",
  milestones: [
    { id: "m1", workspaceId: "workspace-1", title: "MVP", position: 0, completedAt: null, createdAt: "", updatedAt: "", version: 1 },
  ],
  tasks: [
    { id: "t3", workspaceId: "workspace-1", title: "Loose", description: "", position: 0, completedAt: null, createdAt: "", updatedAt: "", version: 1 },
    { id: "t2", workspaceId: "workspace-1", milestoneId: "m1", title: "Second", description: "", position: 1, completedAt: "2026-09-21T00:00:00Z", createdAt: "", updatedAt: "", version: 1 },
    { id: "t1", workspaceId: "workspace-1", milestoneId: "m1", title: "First", description: "", position: 0, completedAt: null, createdAt: "", updatedAt: "", version: 1 },
  ],
};

test("tasksForMilestone keeps ownership groups and position order", () => {
  assert.deepEqual(tasksForMilestone(plan, "m1").map((task) => task.id), ["t1", "t2"]);
  assert.deepEqual(tasksForMilestone(plan).map((task) => task.id), ["t3"]);
});

test("milestoneProgress derives completion without storing duplicate status", () => {
  assert.deepEqual(milestoneProgress(plan, "m1"), { done: 1, total: 2 });
});


test("localDateKey formats local calendar dates without UTC conversion", () => {
  assert.equal(localDateKey(new Date(2026, 0, 1, 12, 0, 0)), "2026-01-01");
  assert.equal(localDateKey(new Date(2026, 11, 31, 23, 59, 59)), "2026-12-31");
  assert.equal(localDateKey(new Date(2026, 8, 5, 0, 0, 0)), "2026-09-05");
});

test("tasksForMilestone orders equal positions deterministically by id", () => {
  const tied: WorkspacePlan = {
    ...plan,
    tasks: [
      { id: "b", workspaceId: "workspace-1", milestoneId: "m1", title: "B", description: "", position: 0, completedAt: null, createdAt: "", updatedAt: "", version: 1 },
      { id: "a", workspaceId: "workspace-1", milestoneId: "m1", title: "A", description: "", position: 0, completedAt: null, createdAt: "", updatedAt: "", version: 1 },
      { id: "loose", workspaceId: "workspace-1", title: "Loose", description: "", position: 0, completedAt: null, createdAt: "", updatedAt: "", version: 1 },
    ],
  };

  assert.deepEqual(tasksForMilestone(tied, "m1").map((task) => task.id), ["a", "b"]);
  assert.deepEqual(tasksForMilestone(tied).map((task) => task.id), ["loose"]);
});
