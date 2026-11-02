import { expect, test } from "@playwright/test";
import { createWorkspace, deleteWorkspace } from "./helpers";

test("@critical Welcome and Canvas expose one shell with optional Explorer", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Notespace home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Notespace settings" })).toBeVisible();
  await page.getByRole("button", { name: "Hide Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();

  const id = await createWorkspace(page, "One shell " + Date.now());
  try {
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
    await expect(page.getByTestId("workspace-view-switcher")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Focus mode" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hide Explorer" })).toBeVisible();
    await page.getByRole("link", { name: "Notespace home" }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteWorkspace(request, id);
  }
});

test("@critical compact viewport can show and hide Explorer without leaving Welcome", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "Hide Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
});

test("@critical category selection owns URL; category disclosure does not", async ({ page, request }) => {
  const response = await request.get("/api/categories");
  expect(response.ok()).toBe(true);
  const categories = await response.json() as Array<{ id: string; title: string }>;
  const category = categories[0];
  expect(category).toBeDefined();
  await page.goto("/");
  const explorer = page.getByRole("navigation", { name: "Categories" });
  await explorer.getByRole("button", { name: `Expand ${category.title}` }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(null);
  await explorer.getByText(category.title, { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(category.id);
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(null);
});

test("@critical returning to Welcome flushes pending temporary Note edits", async ({ page, request }) => {
  const title = "Route flush " + Date.now();
  const id = await createWorkspace(page, title);
  const text = "Saved across Workspace navigation " + Date.now();
  try {
    await page.getByRole("combobox", { name: "Open an existing Note" }).selectOption({ index: 1 });
    const dialog = page.getByRole("dialog", { name: "Note editor" });
    await expect(dialog).toBeVisible();
    const editor = dialog.getByRole("textbox", { name: "Workspace document" });
    await editor.fill(text);
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("link", { name: "Notespace home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("link", { name: `Open ${title}` }).click();
    await page.getByRole("combobox", { name: "Open an existing Note" }).selectOption({ index: 1 });
    await expect(page.getByRole("dialog", { name: "Note editor" }).getByRole("textbox", { name: "Workspace document" })).toContainText(text);
  } finally {
    await deleteWorkspace(request, id);
  }
});

test("@critical Quick Open can open Settings in the shared shell", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search Notespace" }).click();
  const quick = page.getByRole("dialog", { name: "Quick Open" });
  await expect(quick).toBeVisible();
  await quick.getByRole("button", { name: "Settings & Data" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("link", { name: "Export ZIP" })).toHaveAttribute("href", "/api/backup");
});

test("@critical failed library load remains recoverable, not first-run", async ({ page }) => {
  let failures = 0;
  await page.route("**/api/workspaces?**", async (route) => {
    const url = new URL(route.request().url());
    const all = route.request().method() === "GET"
      && url.searchParams.get("snapshot") === "start"
      && url.searchParams.get("limit") === "50";
    if (all && failures++ === 0) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"offline"}' });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  const alert = page.getByRole("alert").filter({ hasText: "Workspaces could not be loaded" });
  await expect(alert).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Workspace" })).toHaveCount(0);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
});
