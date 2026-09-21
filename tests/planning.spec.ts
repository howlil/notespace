import { expect, test } from "@playwright/test";

test("workspace plan persists milestones and tasks across reload", async ({ page, request }) => {
  const title = `Planning ${Date.now()}`;
  const response = await request.post("/api/workspaces", { data: { title } });
  expect(response.status()).toBe(201);
  const workspace = await response.json();

  try {
    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("button", { name: "Plan" })).toBeVisible();
    await page.getByRole("button", { name: "Plan" }).click();

    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Milestone" }).click();
    await page.getByRole("textbox", { name: "Milestone title" }).fill("Ship MVP");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Ship MVP", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add task", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Task title" }).fill("Finish planning flow");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Finish planning flow", { exact: true })).toBeVisible();

    const planResponse = await request.get(`/api/workspaces/${workspace.id}/plan`);
    expect(planResponse.ok()).toBe(true);
    const plan = await planResponse.json() as { tasks: Array<{ id: string; title: string }> };
    const planningTask = plan.tasks.find((item) => item.title === "Finish planning flow");
    expect(planningTask).toBeTruthy();

    await page.getByRole("button", { name: "Start activity for Finish planning flow" }).click();
    const activityMenu = page.getByRole("menu", { name: "Choose activity type" });
    await expect(activityMenu).toBeVisible();
    await activityMenu.getByRole("menuitem", { name: "Write" }).click();
    await expect(page.getByRole("button", { name: "End activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();

    await expect.poll(async () => {
      const activityResponse = await request.get("/api/activity/sessions?limit=20");
      if (!activityResponse.ok()) return null;
      const sessions = await activityResponse.json() as Array<{
        title: string;
        activityType: string;
        workspaceId?: string;
        taskId?: string;
      }>;
      return sessions.find((session) =>
        session.workspaceId === workspace.id
        && session.taskId === planningTask?.id) ?? null;
    }).toMatchObject({
      title: "Finish planning flow",
      activityType: "write",
      workspaceId: workspace.id,
      taskId: planningTask?.id,
    });

    await page.getByRole("button", { name: "Complete Finish planning flow" }).click();
    await expect(page.getByRole("button", { name: "Mark Finish planning flow incomplete" })).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Plan" }).click();
    await expect(page.getByText("Ship MVP", { exact: true })).toBeVisible();
    await expect(page.getByText("Finish planning flow", { exact: true })).toBeVisible();
    await expect(page.getByText("1/1", { exact: true })).toBeVisible();
  } finally {
    const sessionsResponse = await request.get("/api/activity/sessions?limit=100");
    if (sessionsResponse.ok()) {
      const sessions = await sessionsResponse.json() as Array<{ id: string; workspaceId?: string }>;
      for (const session of sessions) {
        if (session.workspaceId === workspace.id) {
          await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
        }
      }
    }
    await request.delete(`/api/workspaces/${workspace.id}`);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
