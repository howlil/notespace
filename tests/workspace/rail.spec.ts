import { test, expect, cleanupWorkspace, createViaAPI } from "./fixtures";

test("@critical Workspace uses one Canvas shell and has no retired view navigation", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Canvas shell ${Date.now()}`);
  try {
    const canvas = page.locator(".excalidraw__canvas.interactive");
    await expect(canvas).toBeVisible();
    const geometry = await canvas.boundingBox();
    expect(geometry?.width).toBeGreaterThan(400);
    expect(geometry?.height).toBeGreaterThan(250);
    await expect(page.getByRole("toolbar", { name: "Canvas tools" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toHaveCount(0);
    await expect(page.getByTestId("workspace-view-switcher")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Focus mode" })).toHaveCount(0);
    await page.getByRole("button", { name: "Hide Explorer" }).click();
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toHaveCount(0);
    await expect(canvas).toBeVisible();
    await page.getByRole("button", { name: "Show Explorer" }).click();
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("@critical narrow Canvas shell has no horizontal page overflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Canvas narrow ${Date.now()}`);
  try {
    await page.getByRole("button", { name: "Hide Explorer" }).click();
    const box = await page.locator(".excalidraw__canvas.interactive").boundingBox();
    expect(box?.width).toBeGreaterThan(280);
    expect(box?.height).toBeGreaterThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
