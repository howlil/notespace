import { expect, test } from "@playwright/test";

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
    await expect(page.getByRole("button", { name: "Pause activity" })).toBeVisible();
    await expect(page.getByRole("button", { name: "End activity" })).toBeVisible();
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(page.getByRole("button", { name: "Start activity" })).toBeVisible();
  } finally {
    await request.delete(`/api/workspaces/${workspace.id}`);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
