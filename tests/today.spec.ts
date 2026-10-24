import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("Today creates only Workspace-owned tasks and preserves Plan identity", async ({ page, request }) => {
  const date = localDateKey();
  const workspaceResponse = await request.post("/api/workspaces", {
    data: { title: `Today ownership ${Date.now()}` },
  });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json() as { id: string; title: string };
  const taskTitle = `Workspace-owned Today task ${Date.now()}`;
  try {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    const title = page.getByRole("textbox", { name: "New task", exact: true });
    await title.fill(taskTitle);
    await page.getByRole("combobox", { name: "Task Workspace" }).selectOption(workspace.id);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    const projection = await (await request.get(`/api/tasks/today?date=${date}`)).json() as {
      tasks: Array<{ id: string; title: string; workspaceId?: string; plannedFor?: string }>;
    };
    const created = projection.tasks.find((task) => task.title === taskTitle);
    expect(created).toMatchObject({ workspaceId: workspace.id, plannedFor: date });
    const plan = await (await request.get(`/api/workspaces/${workspace.id}/plan`)).json() as {
      tasks: Array<{ id: string }>;
    };
    expect(plan.tasks.some((task) => task.id === created?.id)).toBe(true);
    await page.getByRole("button", { name: `Remove ${taskTitle} from Today` }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toHaveCount(0);
    const after = await (await request.get(`/api/workspaces/${workspace.id}/plan`)).json() as {
      tasks: Array<{ id: string; plannedFor?: string }>;
    };
    expect(after.tasks.find((task) => task.id === created?.id)?.plannedFor).toBeFalsy();
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("@critical carried-forward workspace task can be removed from Today", async ({ page, request }) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = localDateKey(today);
  const yesterdayKey = localDateKey(yesterday);

  const workspaceResponse = await request.post("/api/workspaces", {
    data: { title: `Carried forward ${Date.now()}` },
  });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json();

  const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title: "Remove carried-forward task" },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();

  const scheduled = await request.patch(
    `/api/workspaces/${workspace.id}/tasks/${task.id}`,
    { data: { plannedFor: yesterdayKey, version: task.version } },
  );
  expect(scheduled.status()).toBe(200);

  try {
    await page.goto("/today");
    await expect(page.getByText("Remove carried-forward task", { exact: true })).toBeVisible();
    await expect(page.getByText("carried forward", { exact: false })).toBeVisible();

    await page.getByText("Remove carried-forward task", { exact: true }).hover();
    await page.getByRole("button", { name: "Remove Remove carried-forward task from Today" }).click();
    await expect(page.getByText("Remove carried-forward task", { exact: true })).toHaveCount(0);

    const latestResponse = await request.get(`/api/tasks/${task.id}`);
    expect(latestResponse.status()).toBe(200);
    const latest = await latestResponse.json() as { plannedFor?: string | null };
    expect(latest.plannedFor ?? "").toBe("");

    const todayResponse = await request.get(`/api/tasks/today?date=${todayKey}`);
    expect(todayResponse.status()).toBe(200);
    const projection = await todayResponse.json() as { tasks: Array<{ id: string }> };
    expect(projection.tasks.some((item) => item.id === task.id)).toBe(false);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
