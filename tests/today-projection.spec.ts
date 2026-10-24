import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

function day() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

test("@critical Today reconciles a successful Task completion when the response is lost", async ({ page, request }) => {
  const title = `M4 lost response ${Date.now()}`;
  const workspaceResponse = await request.post("/api/workspaces", { data: { title } });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json() as { id: string };
  const created = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title, plannedFor: day() },
  });
  expect(created.status()).toBe(201);
  const task = await created.json() as { id: string };
  const endpoint = `**/api/tasks/${task.id}`;
  try {
    await page.goto("/today");
    await expect(page.getByRole("button", { name: `Complete ${title}` })).toBeVisible();
    await page.route(endpoint, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      await route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic lost response after commit" }) });
    });
    await page.getByRole("button", { name: `Complete ${title}` }).click();
    await expect(page.getByRole("button", { name: `Mark ${title} incomplete` })).toBeVisible();
    await expect(page.getByText("Task update could not be confirmed.", { exact: false })).toHaveCount(0);
    const planResponse = await request.get(`/api/workspaces/${workspace.id}/plan`);
    expect(planResponse.ok()).toBe(true);
    const plan = await planResponse.json() as { tasks: Array<{ id: string; completedAt: string | null }> };
    expect(plan.tasks.find((item) => item.id === task.id)?.completedAt).toBeTruthy();
  } finally {
    await page.unroute(endpoint).catch(() => undefined);
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("Today aggregates different Workspaces and refetches their authoritative task changes", async ({ page, request }) => {
  const workspaces: string[] = [];
  const taskIds: string[] = [];
  const titles = [`M4 alpha ${Date.now()}`, `M4 beta ${Date.now()}`];
  try {
    for (const title of titles) {
      const created = await request.post("/api/workspaces", { data: { title } });
      expect(created.status()).toBe(201);
      const workspace = await created.json() as { id: string };
      workspaces.push(workspace.id);
      const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
        data: { title, plannedFor: day() },
      });
      expect(taskResponse.status()).toBe(201);
      taskIds.push((await taskResponse.json() as { id: string }).id);
    }
    await page.goto("/today");
    for (const title of titles) await expect(page.getByRole("button", { name: `Complete ${title}` })).toBeVisible();
    const current = await request.get(`/api/tasks/${taskIds[1]}`);
    expect(current.ok()).toBe(true);
    const item = await current.json() as { version: number };
    const renamed = `${titles[1]} updated in Plan`;
    const changed = await request.patch(`/api/workspaces/${workspaces[1]}/tasks/${taskIds[1]}`, {
      data: { title: renamed, version: item.version },
    });
    expect(changed.ok()).toBe(true);
    // Equivalent to returning to a browser tab after another view changed a Task.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByRole("button", { name: `Complete ${renamed}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Complete ${titles[0]}` })).toBeVisible();
    const projection = await (await request.get(`/api/tasks/today?date=${day()}`)).json() as {
      tasks: Array<{ id: string; workspaceId?: string }>;
    };
    for (let i = 0; i < 2; i++) {
      expect(projection.tasks.find((task) => task.id === taskIds[i])?.workspaceId).toBe(workspaces[i]);
    }
  } finally {
    for (const workspaceId of workspaces) {
      await deleteWorkspace(request, workspaceId);
      await request.delete(`/api/trash/${workspaceId}`).catch(() => undefined);
    }
  }
});
