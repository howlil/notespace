import { expect, test } from "@playwright/test";
import { createWorkspace, deleteWorkspace, openPaneMenu } from "./helpers";

test("custom and native popups are mutually exclusive and Escape dismisses the active custom popup", async ({ page, request }) => {
  const id = await createWorkspace(page, `Popup ownership ${Date.now()}`);

  try {
    const paneActions = page.locator("details.pane-actions").first();
    await openPaneMenu(page);
    await expect.poll(() => paneActions.getAttribute("open")).not.toBeNull();

    const activityButton = page.getByRole("button", { name: /Activity, today/ });
    await activityButton.click();
    await expect(page.getByRole("dialog", { name: "Activity", exact: true })).toBeVisible();
    await expect.poll(() => paneActions.getAttribute("open")).toBeNull();

    await paneActions.locator("> summary").click();
    await expect.poll(() => paneActions.getAttribute("open")).not.toBeNull();
    await expect(page.getByRole("dialog", { name: "Activity", exact: true })).toHaveCount(0);

    await activityButton.click();
    await expect(page.getByRole("dialog", { name: "Activity", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Activity", exact: true })).toHaveCount(0);
  } finally {
    await deleteWorkspace(request, id);
    await request.delete(`/api/trash/${id}`).catch(() => undefined);
  }
});
