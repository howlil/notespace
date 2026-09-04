import { expect, test } from "@playwright/test";

test("study session activity indicator and history checkpoint preview", async ({
  page,
  request,
}) => {
  const title = `Study History ${Date.now()}`;
  const res = await request.post("/api/projects", {
    data: { title },
  });
  expect(res.status()).toBe(201);
  const workspace = await res.json();

  try {
    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();

    // Verify study indicator exists in workspace header
    await expect(page.locator(".study-indicator")).toBeVisible();

    // Make an edit and wait for save
    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.click();
    await editor.fill("Checkpoint test content");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    // Open history drawer
    await page.locator('summary[aria-label="Workspace actions"]').click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(page.locator(".history-drawer")).toBeVisible();
  } finally {
    await request.delete(`/api/projects/${workspace.id}`);
  }
});
