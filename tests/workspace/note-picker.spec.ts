import { test, expect, createViaAPI, cleanupWorkspace, selectView } from "./fixtures";

test("M3 Note picker has one create control, inline rename, and a trash action per row @critical", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Note picker M3 ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const pane = page.locator('section[aria-label$="note pane"]').first();
    const picker = pane.locator("details.pane-note-switcher");
    const title = picker.locator("summary");

    await title.focus();
    await page.keyboard.press("F2");
    const inline = pane.getByRole("textbox", { name: "Note title" });
    await expect(inline).toBeVisible();
    await inline.fill("Original Note");
    await inline.press("Enter");
    await expect(picker.locator("summary")).toContainText("Original Note");

    // Escape must cancel the draft, not invoke rename again through blur.
    await picker.locator("summary").focus();
    await page.keyboard.press("F2");
    await pane.getByRole("textbox", { name: "Note title" }).fill("Discarded Name");
    await page.keyboard.press("Escape");
    await expect(picker.locator("summary")).toContainText("Original Note");
    await expect(picker.locator("summary")).not.toContainText("Discarded Name");

    // New Note is outside the picker and remains accessible in inline-rename mode.
    await expect(pane.getByRole("button", { name: "New note" })).toHaveCount(1);
    await pane.getByRole("button", { name: "New note" }).click();
    const newTitle = pane.getByRole("textbox", { name: "Note title" });
    await expect(newTitle).toBeFocused();
    await expect(pane.getByRole("button", { name: "New note" })).toBeVisible();
    await newTitle.fill("Practice Notes");
    await newTitle.press("Enter");
    await expect(picker.locator("summary")).toContainText("Practice Notes");

    await picker.locator("summary").click();
    const list = pane.getByRole("listbox", { name: "Notes in this workspace" });
    await expect(list.getByRole("option")).toHaveCount(2);
    await expect(list.getByRole("button", { name: "New note" })).toHaveCount(0);
    await expect(list.getByText("Rename note", { exact: true })).toHaveCount(0);
    await expect(list.getByRole("button", { name: "Delete note Original Note" })).toBeVisible();
    await expect(list.getByRole("button", { name: "Delete note Practice Notes" })).toBeVisible();

    // Deleting a non-active Note must not switch the active editor before confirming.
    await list.getByRole("button", { name: "Delete note Original Note" }).click();
    await expect(page.getByRole("dialog")).toContainText("Original Note");
    await page.getByRole("dialog").getByRole("button", { name: "Delete note", exact: true }).click();
    await expect(picker.locator("summary")).toContainText("Practice Notes");
    await picker.locator("summary").click();
    await expect(pane.getByRole("listbox", { name: "Notes in this workspace" }).getByRole("option")).toHaveCount(1);
    await expect(pane.getByRole("button", { name: "Delete note Practice Notes" })).toBeDisabled();

    await expect(pane.locator("details.pane-actions")).not.toContainText("Delete note");
    await page.reload();
    await expect(page.locator("details.pane-note-switcher").first().locator("summary")).toContainText("Practice Notes");
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("M3 failed deletion keeps the target Note and the active editor unchanged", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Note delete rollback ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const pane = page.locator('section[aria-label$="note pane"]').first();
    await pane.getByRole("button", { name: "New note" }).click();
    const input = pane.getByRole("textbox", { name: "Note title" });
    await input.fill("Keep this Note");
    await input.press("Enter");
    await expect(page.getByRole("status", { name: "Workspace save status" })).toHaveText("Saved");

    let intercepted = false;
    await page.route(`**/api/workspaces/${id}/notes/*`, async (route) => {
      if (route.request().method() === "DELETE") {
        intercepted = true;
        await route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"delete refused"}' });
        return;
      }
      await route.continue();
    });
    const picker = pane.locator("details.pane-note-switcher");
    await picker.locator("summary").click();
    await pane.getByRole("button", { name: "Delete note Keep this Note" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete note", exact: true }).click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Keep note" }).click();
    await expect(picker.locator("summary")).toContainText("Keep this Note");
    await picker.locator("summary").click();
    await expect(pane.getByRole("listbox", { name: "Notes in this workspace" }).getByRole("option")).toHaveCount(2);
  } finally {
    await page.unroute(`**/api/workspaces/${id}/notes/*`);
    await cleanupWorkspace(request, id);
  }
});
