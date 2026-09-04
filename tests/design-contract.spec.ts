import { expect, test } from "@playwright/test";

test("design contract: Library is one progressive category tree", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Knowledge, organized." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent workspaces", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Categories" })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search Notespace" });
  await page.keyboard.press("Control+K");
  await expect(search).toBeFocused();

  const categoryToggle = page.locator(".tree-expander").first();
  if (await categoryToggle.count()) {
    await expect(categoryToggle).toHaveAttribute("aria-expanded", "false");
    await categoryToggle.click();
    await expect(categoryToggle).toHaveAttribute("aria-expanded", "true");
  }

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Categories" })).toHaveCount(0);
  await expect(page.getByRole("main")).toBeVisible();
});

test("design contract: workspace creation stays in Library and authoring shell is focused", async ({
  page,
  request,
}) => {
  let workspaceId: string | undefined;

  try {
    await page.goto("/");
    await page.getByRole("button", { name: /New workspace/ }).first().click();

    const title = `M10 design contract ${Date.now()}`;
    const titleInput = page.getByRole("textbox", { name: "Workspace title" });
    await titleInput.fill(title);
    await titleInput.press("Enter");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    await page.getByRole("link", { name: title }).first().click();
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();

    workspaceId = page.url().split("/").at(-1);
    expect(workspaceId).toBeTruthy();
    await expect(page.locator(".workspace-header")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter focus mode" })).toHaveCount(0);
    await expect(page.getByText("Capture source URL", { exact: true })).toHaveCount(0);
    await expect(page.locator(".workspace-menu-popover")).toBeHidden();
    await page.locator('summary[aria-label="Workspace actions"]').click();
    await expect(page.getByRole("button", { name: "History", exact: true })).toBeVisible();
  } finally {
    if (workspaceId) {
      await request.delete(`/api/projects/${workspaceId}`);
    }
  }
});
