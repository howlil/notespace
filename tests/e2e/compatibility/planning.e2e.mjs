/* Retired Plan UI: historical Milestones and Tasks stay durable and API-readable. */
import { after, before, test } from "node:test";
import {
  api, apiResponse, assert, cleanupWorkspace, createWorkspace, expectCount,
  openWorkspace, reload, role, start, stop,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: retired Plan UI still preserves historical Milestones and Tasks across reload", async () => {
  const workspace = await createWorkspace(`Legacy planning ${Date.now()}`);
  try {
    const milestoneResponse = await apiResponse(`/api/workspaces/${workspace.id}/milestones`, {
      method: "POST",
      body: { title: "Saved milestone" },
    });
    assert.equal(milestoneResponse.status, 201);
    const milestone = await milestoneResponse.json();

    const taskResponse = await apiResponse(`/api/workspaces/${workspace.id}/tasks`, {
      method: "POST",
      body: { title: "Saved task" },
    });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();

    await openWorkspace(workspace.id);
    await expectCount(role("navigation", "Workspace navigation"), 0);
    await expectCount(role("button", "Plan", { exact: true }), 0);
    await reload();

    const saved = await api(`/api/workspaces/${workspace.id}/plan`);
    assert.equal(saved.milestones.some((item) => item.id === milestone.id && item.title === "Saved milestone"), true);
    assert.equal(saved.tasks.some((item) => item.id === task.id && item.title === "Saved task"), true);

    const edited = await apiResponse(`/api/workspaces/${workspace.id}/tasks/${task.id}`, {
      method: "PATCH",
      body: { title: "Updated historical task", version: task.version },
    });
    assert.equal(edited.status, 200);
    const afterEdit = await api(`/api/workspaces/${workspace.id}/plan`);
    assert.equal(afterEdit.tasks.find((item) => item.id === task.id)?.title, "Updated historical task");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("legacy Milestone update remains durable without the retired Plan screen", async () => {
  const workspace = await createWorkspace(`Milestone history ${Date.now()}`);
  try {
    const inserted = await apiResponse(`/api/workspaces/${workspace.id}/milestones`, {
      method: "POST",
      body: { title: "Before update" },
    });
    assert.equal(inserted.status, 201);
    const milestone = await inserted.json();

    const edited = await apiResponse(`/api/workspaces/${workspace.id}/milestones/${milestone.id}`, {
      method: "PATCH",
      body: { title: "After update", version: milestone.version },
    });
    assert.equal(edited.status, 200);

    const saved = await api(`/api/workspaces/${workspace.id}/plan`);
    const updated = saved.milestones.find((item) => item.id === milestone.id);
    assert.equal(updated?.title, "After update");
    assert.equal(updated?.version, milestone.version + 1);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
