import { test, expect, createViaAPI, cleanupWorkspace, selectView } from "./fixtures";

test("M4 Navigate combines Outline and Tiptap Find/Replace without a duplicate Code button @critical", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Navigate M4 ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const pane = page.locator('section[aria-label$="note pane"]').first();
    const editor = pane.getByRole("textbox", { name: "Workspace document" });
    const trigger = pane.getByRole("button", { name: "Navigate note" });

    await expect(trigger).toHaveCount(1);
    await expect(pane.getByRole("button", { name: "Open note outline" })).toHaveCount(0);
    await expect(pane.getByRole("button", { name: "Find in note" })).toHaveCount(0);
    await expect(pane.getByRole("button", { name: "Code block", exact: true })).toHaveCount(0);

    await editor.fill("/heading");
    const slash = page.getByRole("listbox", { name: "Insert block" });
    await expect(slash.getByRole("option", { name: /Heading/ })).toBeVisible();
    await slash.getByRole("option", { name: /Heading/ }).click();
    await page.keyboard.type("Core Principles");
    await editor.press("Enter");
    await page.keyboard.type("Core architecture and core behavior");

    await trigger.click();
    const navigate = pane.getByRole("dialog", { name: "Navigate note" });
    await expect(navigate).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const outline = navigate.getByRole("navigation", { name: "Note outline" });
    await expect(outline).toContainText("Core Principles");
    await outline.getByRole("button", { name: "Core Principles" }).click();
    // Full-width Note keeps the docked Outline open during authoring.
    await expect(navigate).toBeVisible();
    await expect(outline.getByRole("button", { name: "Core Principles" })).toHaveAttribute("aria-current", "location");

    await editor.press("ControlOrMeta+f");
    await expect(navigate).toBeVisible();
    const find = navigate.getByRole("searchbox", { name: "Find" });
    await expect(find).toBeFocused();
    await find.fill("Core");
    await expect(navigate.locator('span[aria-live="polite"]')).toContainText(/matches/);
    await expect(navigate.getByRole("button", { name: "Next result" })).toBeEnabled();
    await navigate.getByRole("button", { name: "Search result 1" }).click();
    await expect(pane.getByRole("button", { name: "Bold", exact: true })).toHaveCount(0);
    await navigate.getByRole("button", { name: "Next result" }).click();
    await navigate.getByRole("button", { name: "Previous result" }).click();
    await navigate.getByRole("textbox", { name: "Replace with" }).fill("System");
    await navigate.getByRole("button", { name: "Match case" }).click();
    await expect(navigate.getByRole("button", { name: "Match case" })).toHaveAttribute("aria-pressed", "true");
    await navigate.getByRole("button", { name: "Replace all" }).click();
    await expect(editor).toContainText("System Principles");
    await expect(page.getByRole("status", { name: "Workspace save status" })).toHaveText("Saved");

    await page.keyboard.press("Escape");
    await expect(navigate).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(navigate.getByRole("navigation", { name: "Note outline" })).toContainText("System Principles");
    await navigate.getByRole("button", { name: "Close navigate" }).click();
    await expect(navigate).toHaveCount(0);

    // Layout menu is separate and owns only Split/Close, never deleting Notes.
    const menu = pane.locator("details.pane-actions");
    await menu.locator("summary").click();
    await expect(menu.getByRole("button", { name: "Split right" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Split down" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Close pane" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Delete note" })).toHaveCount(0);
    await trigger.click();
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(navigate).toBeVisible();
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("M4 Navigate is contained in its Note pane at narrow split widths @critical", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Navigate narrow ${Date.now()}`);
  try {
    await selectView(page, "Split");
    const pane = page.locator('section[aria-label$="note pane"]').first();
    await pane.getByRole("button", { name: "Navigate note" }).click();
    const dialog = pane.getByRole("dialog", { name: "Navigate note" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.evaluate((node) => {
      const panel = node.getBoundingClientRect();
      const parent = node.closest('section[aria-label$="note pane"]')?.getBoundingClientRect();
      return { left: panel.left, right: panel.right, parentLeft: parent?.left ?? -1, parentRight: parent?.right ?? -1, screenRight: window.innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.parentLeft - 1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.parentRight + 1);
    expect(bounds.right).toBeLessThanOrEqual(bounds.screenRight + 1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("Outline v3 keeps H1-H6 hierarchy live, collapse is local, and editor scrolling is scrollbar-free @critical", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const id = await createViaAPI(page, request, `Outline v3 ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const pane = page.locator('section[aria-label$="note pane"]').first();
    const editor = pane.getByRole("textbox", { name: "Workspace document" });
    const trigger = pane.getByRole("button", { name: "Navigate note" });

    await trigger.click();
    const navigate = pane.getByRole("dialog", { name: "Navigate note" });
    const outline = navigate.getByRole("navigation", { name: "Note outline" });
    await expect(navigate).toContainText("Add a heading to navigate this note.");
    await navigate.getByRole("button", { name: "Close navigate" }).click();

    await editor.fill("Architecture");
    await editor.press("ControlOrMeta+Alt+2");
    await editor.press("End");
    await editor.press("Enter");
    await editor.press("ControlOrMeta+Alt+3");
    await page.keyboard.type("Consistency");
    await editor.press("Enter");
    await editor.press("ControlOrMeta+Alt+2");
    await page.keyboard.type("Operations");

    await trigger.click();
    await expect(outline.getByRole("button", { name: "Architecture", exact: true })).toBeVisible();
    await expect(outline.getByRole("button", { name: "Consistency", exact: true })).toBeVisible();
    await expect(outline.getByRole("button", { name: "Operations", exact: true })).toBeVisible();
    await expect(navigate).toHaveCSS("position", "relative");
    await expect(navigate).toHaveCSS("width", "232px");
    await expect.poll(() => editor.evaluate((node) => getComputedStyle(node).scrollbarWidth)).toBe("none");
    await expect.poll(() => outline.evaluate((node) => getComputedStyle(node).scrollbarWidth)).toBe("none");

    await outline.getByRole("button", { name: "Collapse Architecture" }).click();
    await expect(outline.getByRole("button", { name: "Consistency", exact: true })).toHaveCount(0);
    await expect(editor).toContainText("Consistency");
    await expect(outline.getByRole("button", { name: "Operations", exact: true })).toBeVisible();
    await outline.getByRole("button", { name: "Expand Architecture" }).click();
    await expect(outline.getByRole("button", { name: "Consistency", exact: true })).toBeVisible();

    await editor.locator("h3").first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" model");
    await expect(outline.getByRole("button", { name: "Consistency model", exact: true })).toBeVisible();
    await expect(navigate).toBeVisible(); // Docked surface persists while typing.

    await outline.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(outline.getByRole("button", { name: "Operations", exact: true })).toHaveAttribute("aria-current", "location");
    await navigate.getByRole("button", { name: "Close navigate" }).click();
    await expect(navigate).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Workspace save status" })).toHaveText("Saved");
  } finally {
    await cleanupWorkspace(request, id);
  }
});
