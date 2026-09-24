import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("Today combines workspace and standalone tasks without changing ownership", async ({ page, request }) => {
  const date = localDateKey();
  const workspaceResponse = await request.post("/api/workspaces", {
    data: { title: `Today workspace ${Date.now()}` },
  });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json();

  const workspaceTaskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title: "Ship Today projection" },
  });
  expect(workspaceTaskResponse.status()).toBe(201);
  const workspaceTask = await workspaceTaskResponse.json();

  const plannedResponse = await request.patch(
    `/api/workspaces/${workspace.id}/tasks/${workspaceTask.id}`,
    {
      data: { plannedFor: date, version: workspaceTask.version },
    },
  );
  expect(plannedResponse.status()).toBe(200);

  const standaloneResponse = await request.post("/api/tasks", {
    data: { title: "Read one chapter", plannedFor: date },
  });
  expect(standaloneResponse.status()).toBe(201);
  const standalone = await standaloneResponse.json();

  try {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByText("Ship Today projection", { exact: true })).toBeVisible();
    await expect(page.getByText("Read one chapter", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: workspace.title })).toBeVisible();

    await page.getByRole("button", { name: "Complete Read one chapter" }).click();
    await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Read one chapter incomplete" })).toBeVisible();

    await page.getByRole("button", { name: "Remove Ship Today projection from Today" }).click();
    await expect(page.getByText("Ship Today projection", { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Ship Today projection", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Read one chapter", { exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "New standalone task" }).fill("Write daily note");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Write daily note", { exact: true })).toBeVisible();
  } finally {
    const todayResponse = await request.get(`/api/tasks/today?date=${date}`);
    if (todayResponse.ok()) {
      const today = await todayResponse.json();
      for (const task of today.tasks ?? []) {
        if (!task.workspaceId) {
          await request.delete(`/api/tasks/${task.id}`, {
            headers: { "If-Match": `"${task.version}"` },
          }).catch(() => undefined);
        }
      }
    }
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    await request.delete(`/api/tasks/${standalone.id}`, {
      headers: { "If-Match": `"${standalone.version}"` },
    }).catch(() => undefined);
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
