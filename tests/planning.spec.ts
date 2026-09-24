import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical workspace plan persists milestones and tasks across reload", async ({ page, request }) => {
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
    const plan = await planResponse.json() as { tasks: Array<{ id: string; title: string; version: number }> };
    const planningTask = plan.tasks.find((item) => item.title === "Finish planning flow");
    if (!planningTask) throw new Error("Created planning task was not returned by the plan API.");

    await page.getByRole("button", { name: "Start activity for Finish planning flow" }).click();
    const activityMenu = page.getByRole("menu", { name: "Choose activity type" });
    await expect(activityMenu).toBeVisible();
    await activityMenu.getByRole("menuitem", { name: "Write" }).click();
    await expect(page.getByRole("button", { name: "End activity" })).toBeVisible();

    const refreshedTaskTitle = "Finish refreshed planning flow";
    const renameResponse = await request.patch(
      `/api/workspaces/${workspace.id}/tasks/${planningTask.id}`,
      { data: { title: refreshedTaskTitle, version: planningTask.version } },
    );
    expect(renameResponse.status()).toBe(200);

    await page.getByRole("link", { name: "Back to library" }).click();
    await page.getByRole("link", { name: "Today", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: "Active activity" })).toContainText("Finish planning flow");

    await page.getByRole("button", { name: "End activity" }).click();

    const handoff = page.getByRole("status", { name: "Task completion handoff" });
    await expect(handoff).toContainText(refreshedTaskTitle);
    await expect(handoff).toContainText("Mark task done?");
    await expect(page.getByRole("textbox", { name: "Quick activity" })).toBeEnabled();

    await page.reload();
    await expect(page.getByRole("status", { name: "Task completion handoff" })).toContainText(refreshedTaskTitle);
    await expect(page.getByRole("textbox", { name: "Quick activity" })).toBeEnabled();

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
        && session.taskId === planningTask.id) ?? null;
    }).toMatchObject({
      title: "Finish planning flow",
      activityType: "write",
      workspaceId: workspace.id,
      taskId: planningTask.id,
    });

    const completionUrl = `**/api/tasks/${planningTask.id}`;
    await page.route(completionUrl, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic response failure after commit" }),
      });
    });

    await handoff.getByRole("button", { name: "Mark done" }).click();
    await expect(handoff).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.unroute(completionUrl);
    await expect(page.getByRole("textbox", { name: "Quick activity" })).toBeEnabled();

    await expect.poll(async () => {
      const response = await request.get(`/api/tasks/${planningTask.id}`);
      if (!response.ok()) return false;
      const task = await response.json() as { completedAt?: string };
      return Boolean(task.completedAt);
    }).toBe(true);

    await page.goto(`/workspaces/${workspace.id}`);
    await page.getByRole("button", { name: "Plan" }).click();
    await expect(page.getByText("Ship MVP", { exact: true })).toBeVisible();
    await expect(page.getByText(refreshedTaskTitle, { exact: true })).toBeVisible();
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
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
