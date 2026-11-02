import { test, expect, createViaAPI, cleanupWorkspace, selectView } from "./fixtures";

test("@critical temporary Tiptap editor retains Navigate outline and Find/Replace", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Navigate overlay ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const dialog = page.getByRole("dialog", { name: "Note editor" });
    const editor = dialog.getByRole("textbox", { name: "Workspace document" });
    await editor.fill("/heading");
    const slash = page.getByRole("listbox", { name: "Insert block" });
    await slash.getByRole("option", { name: /Heading/ }).click();
    await page.keyboard.type("Core Principles");
    await editor.press("Enter");
    await page.keyboard.type("Core architecture and core behavior");

    const trigger = dialog.getByRole("button", { name: "Navigate note" });
    await trigger.click();
    const navigate = dialog.getByRole("dialog", { name: "Navigate note" });
    await expect(navigate.getByRole("navigation", { name: "Note outline" })).toContainText("Core Principles");
    await editor.press("ControlOrMeta+f");
    const find = navigate.getByRole("searchbox", { name: "Find" });
    await expect(find).toBeFocused();
    await find.fill("Core");
    await expect(navigate.getByRole("button", { name: "Next result" })).toBeEnabled();
    await navigate.getByRole("textbox", { name: "Replace with" }).fill("System");
    await navigate.getByRole("button", { name: "Replace all" }).click();
    await expect(editor).toContainText("System Principles");
    await navigate.getByRole("button", { name: "Close navigate" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await selectView(page, "Note");
    await expect(page.getByRole("dialog", { name: "Note editor" }).getByRole("textbox", { name: "Workspace document" })).toContainText("System Principles");
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("@critical Note editor remains usable on narrow viewports without restoring Split", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Navigate compact ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const dialog = page.getByRole("dialog", { name: "Note editor" });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(391);
    await expect(dialog.getByRole("button", { name: "Navigate note" })).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("separator", { name: /Resize/ })).toHaveCount(0);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
