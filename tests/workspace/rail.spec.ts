import { test, expect, cleanupWorkspace, createViaAPI } from "./fixtures";

test("M1 Workspace rail is full-height, centered and has no duplicate actions @critical", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Rail M1 ${Date.now()}`);
  try {
    const rail = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(rail).toBeVisible();
    const metrics = await rail.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const views = element.querySelector('[data-testid="workspace-view-switcher"]')?.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, viewportHeight: window.innerHeight, middle: views ? views.y + views.height / 2 - (box.y + box.height / 2) : null };
    });
    expect(metrics.width).toBe(40);
    expect(metrics.x).toBe(0);
    expect(metrics.y).toBe(0);
    expect(metrics.height).toBe(metrics.viewportHeight);
    expect(metrics.middle).not.toBeNull();
    expect(Math.abs(metrics.middle!)).toBeLessThanOrEqual(1);

    await expect(rail.getByRole("link", { name: "Back to library" })).toHaveCount(1);
    const views = rail.getByRole("group", { name: "Workspace view" });
    await expect(views.getByRole("button")).toHaveCount(4);
    await expect(rail.getByRole("button", { name: "Focus mode" })).toHaveCount(1);
    await expect(rail.getByRole("button", { name: /^Activity, today/ })).toHaveCount(1);
    await expect(page.locator(".workspace-header")).toHaveCount(0);
    await expect(page.locator(".workspace-switcher")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open Notespace settings" })).toHaveCount(0);

    await rail.getByRole("button", { name: /^Activity, today/ }).click();
    const dialog = page.getByRole("dialog", { name: "Activity" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Start activity" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await views.getByRole("button", { name: "Plan" }).click();
    await expect(rail.getByRole("button", { name: "Focus mode" })).toBeDisabled();
    await views.getByRole("button", { name: "Note" }).click();
    await expect(rail.getByRole("button", { name: "Focus mode" })).toBeEnabled();

    await rail.getByRole("button", { name: "Focus mode" }).click();
    await expect(page.locator(".workspace-rail")).toHaveCount(0);
    await page.getByRole("button", { name: "Restore layout" }).click();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("M1 Workspace rail retains usable space on narrow viewport @critical", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Rail narrow ${Date.now()}`);
  try {
    const rail = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(rail).toHaveCSS("width", "40px");
    await rail.getByRole("group", { name: "Workspace view" }).getByRole("button", { name: "Split" }).click();
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Canvas pane" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
