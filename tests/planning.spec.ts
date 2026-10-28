import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical retired Plan UI still preserves historical Milestones and Tasks across reload", async ({ page, request }) => {
  const stamp = Date.now();
  const created = await request.post("/api/workspaces", { data: { title: `Legacy planning ${stamp}` } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  try {
    const milestoneResponse = await request.post(`/api/workspaces/${workspace.id}/milestones`, { data: { title: "Saved milestone" } });
    expect(milestoneResponse.status()).toBe(201);
    const milestone = await milestoneResponse.json() as { id: string };
    const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, { data: { title: "Saved task" } });
    expect(taskResponse.status()).toBe(201);
    const task = await taskResponse.json() as { id: string; version: number };

    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Plan", exact: true })).toHaveCount(0);
    await page.reload();

    const historical = await request.get(`/api/workspaces/${workspace.id}/plan`);
    expect(historical.status()).toBe(200);
    const saved = await historical.json() as {
      milestones: Array<{ id: string; title: string }>;
      tasks: Array<{ id: string; title: string; version: number }>;
    };
    expect(saved.milestones).toEqual(expect.arrayContaining([expect.objectContaining({ id: milestone.id, title: "Saved milestone" })]));
    expect(saved.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id, title: "Saved task" })]));

    const edited = await request.patch(`/api/workspaces/${workspace.id}/tasks/${task.id}`, {
      data: { title: "Updated historical task", version: task.version },
    });
    expect(edited.status()).toBe(200);
    const afterEdit = await (await request.get(`/api/workspaces/${workspace.id}/plan`)).json() as {
      tasks: Array<{ id: string; title: string }>;
    };
    expect(afterEdit.tasks.find((item) => item.id === task.id)?.title).toBe("Updated historical task");
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("legacy Milestone update remains durable without the retired Plan screen", async ({ request }) => {
  const stamp = Date.now();
  const created = await request.post("/api/workspaces", { data: { title: `Milestone history ${stamp}` } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  try {
    const inserted = await request.post(`/api/workspaces/${workspace.id}/milestones`, {
      data: { title: "Before update" },
    });
    expect(inserted.status()).toBe(201);
    const milestone = await inserted.json() as { id: string; version: number };
    const edited = await request.patch(`/api/workspaces/${workspace.id}/milestones/${milestone.id}`, {
      data: { title: "After update", version: milestone.version },
    });
    expect(edited.status()).toBe(200);
    const read = await request.get(`/api/workspaces/${workspace.id}/plan`);
    expect(read.status()).toBe(200);
    const saved = await read.json() as { milestones: Array<{ id: string; title: string; version: number }> };
    expect(saved.milestones.find((item) => item.id === milestone.id)).toMatchObject({
      title: "After update", version: milestone.version + 1,
    });
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
