import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("activity opens current session controls and recent history", async ({
  page,
  request,
}) => {
  const title = `Activity ${Date.now()}`;
  const res = await request.post("/api/workspaces", {
    data: { title },
  });
  expect(res.status()).toBe(201);
  const workspace = await res.json();

  try {
    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();

    const activity = page.getByRole("button", { name: /^Activity,/ });
    const start = page.getByRole("button", { name: "Start activity" });
    await expect(activity).toBeVisible();
    await expect(start).toBeVisible();

    await activity.click();
    await expect(page.getByRole("dialog", { name: "Activity" })).toBeVisible();
    await expect(page.getByText("Recent sessions", { exact: true })).toBeVisible();

    await start.click();
    const typeMenu = page.getByRole("menu", { name: "Choose activity type" });
    await expect(typeMenu).toBeVisible();
    await typeMenu.getByRole("menuitem", { name: "Build" }).click();

    await expect(page.getByRole("button", { name: "Pause activity" })).toBeVisible();
    await expect(page.getByRole("button", { name: "End activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(page.getByRole("button", { name: "Start activity" })).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get("/api/activity/sessions?limit=20");
      if (!response.ok()) return null;
      const sessions = await response.json() as Array<{
        workspaceId?: string;
        activityType: string;
        title: string;
      }>;
      return sessions.find((session) => session.workspaceId === workspace.id) ?? null;
    }).toMatchObject({
      workspaceId: workspace.id,
      activityType: "build",
      title,
    });
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
