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

test("@critical Quick Open can open Settings after global rail removal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Search Notespace/ }).click();
  const quick = page.getByRole("dialog", { name: "Quick Open" });
  await expect(quick).toBeVisible();
  await quick.getByRole("button", { name: "Settings & Data" }).click();
  await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
});
