import { expect, test } from "@playwright/test";

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("Activity starts standalone or from a Today task with context preserved", async ({ page, request }) => {
  const date = localDateKey();
  const suffix = Date.now();
  const workspaceResponse = await request.post("/api/workspaces", {
    data: { title: `Activity workspace ${suffix}` },
  });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json();

  const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title: `Ship activity slice ${suffix}` },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();

  const plannedResponse = await request.patch(
    `/api/workspaces/${workspace.id}/tasks/${task.id}`,
    { data: { plannedFor: date, version: task.version } },
  );
  expect(plannedResponse.status()).toBe(200);

  const standaloneTitle = `Read systems paper ${suffix}`;

  try {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

    const quickActivity = page.getByRole("textbox", { name: "Quick activity" });
    const activityType = page.getByRole("combobox", { name: "Activity type" });
    await expect(quickActivity).toBeVisible();

    await quickActivity.fill(standaloneTitle);
    await activityType.selectOption("read");
    await page.getByRole("button", { name: "Start", exact: true }).click();

    await expect(page.getByText(standaloneTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(quickActivity).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=20");
      if (!response.ok()) return null;
      const sessions = await response.json();
      const session = sessions.find((item: any) => item.title === standaloneTitle);
      if (!session) return null;
      return {
        title: session.title,
        activityType: session.activityType,
        workspaceId: session.workspaceId ?? "",
        taskId: session.taskId ?? "",
      };
    }).toEqual({
      title: standaloneTitle,
      activityType: "read",
      workspaceId: "",
      taskId: "",
    });

    await activityType.selectOption("build");
    await page.getByRole("button", { name: `Start activity for ${task.title}` }).click();

    await expect(page.getByText(task.title, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "End activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=20");
      if (!response.ok()) return null;
      const sessions = await response.json();
      return sessions.find((session: any) => session.taskId === task.id) ?? null;
    }).toMatchObject({
      title: task.title,
      activityType: "build",
      workspaceId: workspace.id,
      taskId: task.id,
    });
  } finally {
    const sessionsResponse = await request.get("/api/activity/sessions?limit=100");
    if (sessionsResponse.ok()) {
      const sessions = await sessionsResponse.json();
      for (const session of sessions) {
        if (
          session.title === standaloneTitle
          || session.taskId === task.id
        ) {
          await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
        }
      }
    }
    await request.delete(`/api/workspaces/${workspace.id}`).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
