import { expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";

/**
 * Create a workspace via the Home UI and navigate into it.
 * Returns the workspace ID extracted from the URL.
 */
export async function createWorkspace(
  page: Page,
  title: string,
): Promise<string> {
  await page.goto("/");
  await page
    .getByRole("button", { name: /New workspace/ })
    .first()
    .click();
  const titleInput = page.getByRole("textbox", { name: "Workspace title" });
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: title }).first().click();
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toBeVisible();
  return page.url().split("/").at(-1)!;
}

/** Wait for autosave to complete. */
export async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

/** Open the pane actions menu for the first pane. */
export async function openPaneMenu(page: Page): Promise<void> {
  const details = page.locator("details.pane-actions").first();
  const open = await details.getAttribute("open");
  if (open === null) {
    await page.locator('summary[aria-label^="Actions for"]').first().click();
  }
}

/** Open the canvas in the current workspace. */
export async function openCanvas(page: Page): Promise<void> {
  await openPaneMenu(page);
  await page.getByRole("button", { name: "Open Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
}

/** Navigate back to the library/home. */
export async function goHome(page: Page): Promise<void> {
  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
}

/** Clean up a workspace via API. */
export async function deleteWorkspace(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  if (id) {
    await request.delete(`/api/projects/${id}`);
  }
}

/** Clean up a category via API. */
export async function deleteCategory(
  request: APIRequestContext,
  id: string,
): Promise<void> {
  if (id) {
    await request.delete(`/api/categories/${id}`);
  }
}

/** Take a labeled screenshot and save to test-results/. */
export async function capture(
  page: Page,
  name: string,
): Promise<void> {
  await page.screenshot({
    path: `test-results/${name}.png`,
    fullPage: true,
  });
}
