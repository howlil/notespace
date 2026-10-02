import { test, expect, cleanupWorkspace, createViaAPI, openPaneMenu, selectView } from "./fixtures";

test("pane tree splits, enters focus mode, and restores layout", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Pane tree ${Date.now()}`);

  try {
    for (let index = 0; index < 2; index += 1) {
      await page.getByRole("button", { name: "New note", exact: true }).click();
    }

    await openPaneMenu(page);
    await page.getByRole("button", { name: "Split right", exact: true }).click();
    await openPaneMenu(page);
    await page.getByRole("button", { name: "Split down", exact: true }).click();
    await expect(page.locator('section[aria-label$="note pane"]')).toHaveCount(3);

    const maximize = page.getByRole("button", { name: /Maximize active (pane|split)/ });
    await expect(maximize).toBeVisible();
    await maximize.click();
    await expect(page.locator(".workspace-main.is-focus-mode")).toBeVisible();
    await expect(page.locator(".workspace-header")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.locator(".workspace-header")).toBeVisible();
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("narrow split view retains note and canvas without horizontal overflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Narrow ${Date.now()}`);

  try {
    await selectView(page, "Split");
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("single Note view uses a centered article-width writing column", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createViaAPI(page, request, `Article width ${Date.now()}`);

  try {
    await selectView(page, "Note");
    const editor = page.getByRole("textbox", { name: "Workspace document" });
    const pane = page.locator('section[aria-label$="note pane"]').first();
    const editorBox = await editor.boundingBox();
    const paneBox = await pane.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(paneBox).not.toBeNull();
    expect(editorBox!.width).toBeLessThanOrEqual(762);
    expect(Math.abs((editorBox!.x + editorBox!.width / 2) - (paneBox!.x + paneBox!.width / 2))).toBeLessThan(6);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
