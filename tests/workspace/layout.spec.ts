import { test, expect, cleanupWorkspace, createViaAPI, openPaneMenu, selectView } from "./fixtures";

test("pane tree splits, enters focus mode, and restores layout", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Pane tree ${Date.now()}`);

  try {
    for (let index = 0; index < 2; index += 1) {
      await page.getByRole("button", { name: "New note", exact: true }).click();
      // New Note now intentionally enters inline rename: complete it before
      // creating the next note so the subsequent pane action is deterministic.
      const title = page.getByRole("textbox", { name: "Note title" });
      await expect(title).toBeFocused();
      await title.fill(`Pane Note ${index + 2}`);
      await title.press("Enter");
      await expect(page.locator("details.pane-note-switcher > summary").first()).toContainText(`Pane Note ${index + 2}`);
    }

    await openPaneMenu(page);
    await page.getByRole("button", { name: "Split right", exact: true }).click();
    await expect(page.locator('section[aria-label$="note pane"]')).toHaveCount(2);
    await openPaneMenu(page);
    await page.getByRole("button", { name: "Split down", exact: true }).click();
    await expect(page.locator('section[aria-label$="note pane"]')).toHaveCount(3);

    const focus = page.getByRole("button", { name: "Focus mode" });
    await expect(focus).toBeVisible();
    await focus.click();
    await expect(page.locator(".workspace-main.is-focus-mode")).toBeVisible();
    await expect(page.locator(".workspace-rail")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restore layout" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(".workspace-rail")).toBeVisible();
    await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Plan" }).click();
    await expect(page.getByRole("button", { name: "Focus mode" })).toBeDisabled();
    await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Note" }).click();
    await expect(page.getByRole("button", { name: "Focus mode" })).toBeEnabled();
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
