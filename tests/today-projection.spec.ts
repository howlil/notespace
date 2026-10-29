import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

function day() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

test("historical carried-forward Task remains queryable after Plan UI retirement", async ({ request }) => {
  const title = `M4 carried Plan ${Date.now()}`;
  const created = await request.post("/api/workspaces", { data: { title } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, { data: { title, plannedFor: date } });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json() as { id: string; version: number };
  try {
    const today = await request.get(`/api/tasks/today?date=${day()}`);
    expect(today.status()).toBe(200);
    const projection = await today.json() as { tasks: Array<{ id: string }> };
    expect(projection.tasks.some(item => item.id === task.id)).toBe(true);

    const cleared = await request.patch(`/api/workspaces/${workspace.id}/tasks/${task.id}`, {
      data: { plannedFor: "", version: task.version },
    });
    expect(cleared.status()).toBe(200);
    const latest = await request.get(`/api/tasks/${task.id}`);
    expect(latest.status()).toBe(200);
    const value = await latest.json() as { plannedFor?: string | null };
    expect(value.plannedFor ?? "").toBe("");
    const updated = await (await request.get(`/api/tasks/today?date=${day()}`)).json() as { tasks: Array<{ id: string }> };
    expect(updated.tasks.some(item => item.id === task.id)).toBe(false);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
