import { expect, test } from "@playwright/test";
import { createWorkspace, deleteWorkspace } from "./helpers";

test("@critical Home owns one fixed sidebar and no duplicate navigation", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Category explorer" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Notespace home" })).toHaveCount(1);
  await expect(sidebar.getByRole("button", { name: "New category" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Library views" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle category explorer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Search Notespace/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Notespace settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "How to use Notespace" })).toBeVisible();
  await page.getByRole("button", { name: "Open Notespace settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "How to use Notespace" }).click();
  const guide = page.getByRole("dialog", { name: "How Notespace works" });
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Close Notespace guide" }).click();
  await expect(guide).toHaveCount(0);
});

test("@critical fixed Home sidebar survives compact layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Explorer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle category explorer" })).toHaveCount(0);
});

test("@critical category disclosure does not navigate but category selection does", async ({ page, request }) => {
  const response = await request.get("/api/categories");
  expect(response.ok()).toBe(true);
  const categories = await response.json() as Array<{ id: string; title: string }>;
  const category = categories[0];
  expect(category).toBeDefined();
  await page.goto("/");
  const explorer = page.getByRole("navigation", { name: "Categories" });
  await explorer.getByRole("button", { name: `Expand ${category.title}` }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(null);
  await expect(explorer.getByRole("button", { name: `Collapse ${category.title}` })).toBeVisible();
  await explorer.getByText(category.title, { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(category.id);
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(null);
});

test("@critical Workspace keeps Web Back, authoring modes and Focus in a single rail", async ({ page, request }) => {
  const id = await createWorkspace(page, "Notespace v8 Shell");
  try {
    const rail = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(rail.getByRole("link", { name: "Back to library" })).toBeVisible();
    for (const mode of ["Canvas", "Note", "Split"]) {
      await expect(page.getByTestId("workspace-view-switcher").getByRole("button", { name: mode })).toBeVisible();
    }
    await expect(rail.getByRole("button", { name: "Focus mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle category explorer" })).toHaveCount(0);
    await rail.getByRole("link", { name: "Back to library" }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteWorkspace(request, id);
  }
});

test("@critical Workspace Back flushes pending Note edits before re-entry", async ({ page, request }) => {
  const title = "Route flush " + Date.now();
  const id = await createWorkspace(page, title);
  const text = "Saved across Workspace Back " + Date.now();
  try {
    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await expect(editor).toBeVisible();
    await editor.fill(text);
    // Deliberately do not wait for Saved. Navigation must settle the latest
    // editor snapshot and versioned Note write before the route unmounts.
    await page.getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("link", { name: "Back to library" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("link", { name: "Open " + title }).click();
    await expect(page).toHaveURL(new RegExp("/workspaces/" + id + "$"));
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText(text);
    await expect(page.getByRole("status", { name: "Workspace save status" })).toHaveText("Saved");
  } finally {
    await deleteWorkspace(request, id);
  }
});

test("@critical Quick Open can open Settings after global rail removal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Search Notespace/ }).click();
  const quick = page.getByRole("dialog", { name: "Quick Open" });
  await expect(quick).toBeVisible();
  await quick.getByRole("button", { name: "Settings & Data" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("link", { name: "Export ZIP" })).toHaveAttribute("href", "/api/backup");
  await expect(page.getByRole("dialog", { name: "Data & Recovery" })).toHaveCount(0);
});

test("@critical failed Home load is retryable and never appears empty", async ({ page }) => {
  let failures = 0;
  await page.route("**/api/workspaces?**", async (route) => {
    const url = new URL(route.request().url());
    const isAll = route.request().method() === "GET"
      && url.searchParams.get("snapshot") === "start"
      && url.searchParams.get("limit") === "50";
    if (isAll && failures++ === 0) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"offline"}' });
      return;
    }
    await route.continue();
  });
  await page.goto("/");
  const alert = page.getByRole("alert").filter({ hasText: "Workspaces could not be loaded" });
  await expect(alert).toBeVisible();
  await expect(page.getByText("No workspaces here")).toHaveCount(0);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
});
