import { expect, test } from "@playwright/test";

test("@critical shared rail navigates Library, Inbox and Today while Explorer remains optional", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  const categories = page.getByRole("navigation", { name: "Categories" });
  const toggle = rail.getByRole("button", { name: "Toggle category explorer" });

  await expect(rail).toBeVisible();
  await expect(categories).toBeVisible();
  await toggle.click();
  await expect(categories).toBeHidden();
  await toggle.click();
  await expect(categories).toBeVisible();

  await rail.getByRole("link", { name: "Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(rail.getByRole("link", { name: "Inbox" })).toHaveAttribute("aria-current", "page");
  await rail.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(rail.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
});

test("@critical mobile Explorer is initially closed, can be opened and dismissed by Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  const toggle = rail.getByRole("button", { name: "Toggle category explorer" });
  const categories = page.getByRole("navigation", { name: "Categories" });
  await expect(rail).toBeVisible();
  await expect(categories).toBeHidden();
  await toggle.click();
  await expect(categories).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(categories).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("@critical Create menu delegates to existing Explorer form and global capture survives page changes", async ({ page }) => {
  await page.goto("/inbox");
  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.click();
  await expect(page.getByRole("menuitem", { name: "Workspace" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Category" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();

  await create.click();
  await page.getByRole("menuitem", { name: "Category" }).click();
  await expect(page.getByRole("textbox", { name: "Category title" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/today");
  await page.keyboard.press("Control+Shift+N");
  await expect(page.getByRole("dialog", { name: "Quick capture" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("@critical Data & Recovery is a single reusable dialog from rail or Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Data and recovery" }).click();
  await expect(page.getByRole("dialog", { name: "Data & Recovery" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Data & Recovery" })).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Notespace settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await settings.getByRole("button", { name: "Open Data & Recovery" }).click();
  await expect(page.getByRole("dialog", { name: "Data & Recovery" })).toBeVisible();
});
