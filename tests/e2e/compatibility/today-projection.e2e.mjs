/* Historical carried-forward Task projection stays queryable after Plan retirement. */
import { after, before, test } from "node:test";
import {
  api, apiResponse, assert, cleanupWorkspace, createWorkspace, start, stop,
} from "../support/harness.mjs";

before(start);
after(stop);

function isoDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("historical carried-forward Task remains queryable after Plan UI retirement", async () => {
  const title = `M4 carried Plan ${Date.now()}`;
  const workspace = await createWorkspace(title);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const created = await apiResponse(`/api/workspaces/${workspace.id}/tasks`, {
    method: "POST",
    body: { title, plannedFor: isoDay(yesterday) },
  });
  assert.equal(created.status, 201);
  const task = await created.json();
  try {
    const today = await api(`/api/tasks/today?date=${isoDay()}`);
    assert.equal(today.tasks.some((item) => item.id === task.id), true);

    const cleared = await apiResponse(`/api/workspaces/${workspace.id}/tasks/${task.id}`, {
      method: "PATCH",
      body: { plannedFor: "", version: task.version },
    });
    assert.equal(cleared.status, 200);

    const latest = await api(`/api/tasks/${task.id}`);
    assert.equal(latest.plannedFor ?? "", "");

    const projected = await api(`/api/tasks/today?date=${isoDay()}`);
    assert.equal(projected.tasks.some((item) => item.id === task.id), false);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
