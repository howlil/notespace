import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical retired Today deep link redirects to Home without changing stored Tasks", async ({ page, request }) => {
  const created = await request.post("/api/workspaces", {
    data: { title: `Retired Today redirect ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  const task = await request.post(`/api/workspaces/${workspace.id}/tasks`, {
    data: { title: "Historical retained task" },
  });
  expect(task.status()).toBe(201);
  const id = (await task.json() as { id: string }).id;
  try {
    await page.goto("/today#new-task");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toHaveCount(0);
    const stored = await request.get(`/api/tasks/${id}`);
    expect(stored.ok()).toBe(true);
    expect((await stored.json() as { title: string }).title).toBe("Historical retained task");
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
