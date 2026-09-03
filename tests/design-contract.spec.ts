import { expect, test } from "@playwright/test";

test("design contract: Home stays resume-first with progressive library disclosure", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent workspaces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search Notespace" });
  await page.keyboard.press("Control+K");
  await expect(search).toBeFocused();

  const categoryToggles = page.locator(".category-summary-toggle");
  if ((await categoryToggles.count()) > 0) {
    await expect(categoryToggles.first()).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".category-preview")).toHaveCount(0);
    await categoryToggles.first().click();
    await expect(categoryToggles.first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".category-preview").first()).toBeVisible();
  }

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Categories" })).toHaveCount(0);
  await expect(page.getByRole("main")).toBeVisible();
});

test("design contract: Workspace removes library chrome and focus mode is reversible", async ({
  page,
  request,
}) => {
  let workspaceId: string | undefined;

  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "New workspace", exact: true })
      .first()
      .click();

    const title = page.getByRole("textbox", { name: "Workspace title" });
    await title.fill(`Design contract ${Date.now()}`);
    await title.press("Enter");

    await expect(
      page.getByRole("textbox", { name: "Workspace document" }),
    ).toBeVisible();

    workspaceId = page.url().split("/").at(-1);
    expect(workspaceId).toBeTruthy();

    await expect(page.locator("aside.sidebar")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Enter focus mode" }).click();
    await expect(
      page.getByRole("button", { name: "Show workspace header" }),
    ).toBeVisible();
    await expect(page.locator(".workspace-header")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(".workspace-header")).toBeVisible();
  } finally {
    if (workspaceId) {
      await page.goto("/");
      const response = await request.delete(`/api/projects/${workspaceId}`);
      expect(response.ok()).toBeTruthy();
    }
  }
});
