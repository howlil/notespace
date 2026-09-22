import test from "node:test";
import assert from "node:assert/strict";
import { milestoneProgress, tasksForMilestone, type WorkspacePlan } from "./planning.ts";

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
