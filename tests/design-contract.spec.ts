import { expect, test } from "@playwright/test";

test("design contract: Library keeps a persistent category tree and global quick search", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Recent workspaces", exact: true })).toBeVisible();
  const categories = page.getByRole("navigation", { name: "Categories" });
  await expect(categories).toBeVisible();
  await expect(page.getByRole("button", { name: "New category" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New workspace/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveCount(0);

  const searchTrigger = page.getByRole("button", { name: /Search Notespace/ });
  await expect(searchTrigger).toBeVisible();
  await searchTrigger.click();
  const search = page.getByPlaceholder("Open workspace, note, block, or category…");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+K");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");

  const categoryToggle = categories.locator('button[aria-expanded]').first();
  if (await categoryToggle.count()) {
    await expect(categoryToggle).toHaveAttribute("aria-expanded", "false");
    await categoryToggle.click();
    await expect(categoryToggle).toHaveAttribute("aria-expanded", "true");
  }

  await expect(categories).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("design contract: sidebar tree keeps inline editing and contextual actions", async ({ page, request }) => {
  const title = `Design Category ${Date.now()}`;
  const response = await request.post("/api/categories", { data: { title } });
  expect(response.status()).toBe(201);
  const created = await response.json();

  try {
    await page.goto("/");
    const category = page.getByRole("button").filter({ hasText: title }).first();
    await expect(category).toBeVisible();
    await category.dblclick();
    await expect(page.getByRole("textbox", { name: "Category title" })).toBeVisible();
    await page.keyboard.press("Escape");

    await category.click({ button: "right" });
    await expect(page.getByRole("menuitem", { name: "New workspace" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  } finally {
    await request.delete(`/api/categories/${created.id}`);
  }
});

test("design contract: workspace creation stays in Library and authoring shell is focused", async ({
  page,
  request,
}) => {
  const title = `M10 design contract ${Date.now()}`;
  const response = await request.post("/api/workspaces", { data: { title } });
  expect(response.status()).toBe(201);
  const workspace = await response.json();

  try {
    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await expect(page.locator(".workspace-header")).toBeVisible();
    await expect(page.getByText("Capture source URL", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "History", exact: true })).toHaveCount(0);
  } finally {
    await request.delete(`/api/workspaces/${workspace.id}`);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
