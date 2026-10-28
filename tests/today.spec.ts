import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("@critical Today has no new Task composer but keeps scheduled historical Workspace Tasks", async ({ page, request }) => {
  const date = localDateKey();
  const createdWorkspace = await request.post("/api/workspaces", {
    data: { title: `Today legacy ${Date.now()}` },
  });
  expect(createdWorkspace.status()).toBe(201);
  const workspace = await createdWorkspace.json() as { id: string };
  const taskTitle = `Historical scheduled Task ${Date.now()}`;
  const createdTask = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title: taskTitle, plannedFor: date },
  });
  expect(createdTask.status()).toBe(201);
  const task = await createdTask.json() as { id: string };
  try {
    await page.goto("/today#new-task");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New task", exact: true })).toHaveCount(0);
    await expect(page.getByText("Legacy Today recovery.")).toBeVisible();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
    const plan = await (await request.get(`/api/workspaces/${workspace.id}/plan`)).json() as {
      tasks: Array<{ id: string; title: string; plannedFor?: string | null }>;
    };
    expect(plan.tasks.find((value) => value.id === task.id)).toMatchObject({ title: taskTitle, plannedFor: date });
    await page.getByRole("button", { name: `Remove ${taskTitle} from Today` }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toHaveCount(0);
    const after = await (await request.get(`/api/workspaces/${workspace.id}/plan`)).json() as {
      tasks: Array<{ id: string; plannedFor?: string | null }>;
    };
    expect(after.tasks.find((value) => value.id === task.id)?.plannedFor ?? "").toBe("");
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
    await expect(page.getByText("Remove carried-forward task", { exact: true }).locator("..").getByText("carried forward", { exact: false })).toBeVisible();

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
