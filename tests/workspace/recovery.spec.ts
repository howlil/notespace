import { test, expect, cleanupWorkspace, createViaAPI } from "./fixtures";

test("failed autosave blocks navigation and retry preserves content", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Recovery ${Date.now()}`);

  try {
    const noteSaveRoute = `**/api/workspaces/${id}/notes/*`;
    await page.route(noteSaveRoute, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Storage temporarily unavailable" }),
        });
        return;
      }
      await route.continue();
    });

    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.fill("Keep this thought");
    await expect(page.getByRole("alert")).toContainText("Storage temporarily unavailable");

    await page.getByRole("link", { name: "Back to library", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${id}`));
    await expect(editor).toContainText("Keep this thought");

    await page.unroute(noteSaveRoute);
    await page.getByRole("button", { name: "Retry save" }).first().click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("Keep this thought");
  } finally {
    await cleanupWorkspace(request, id);
  }
});
