import { expect, test } from "@playwright/test";
import { createWorkspace, deleteWorkspace, openCanvas, waitSaved } from "./helpers";

test("@critical same-browser Canvas peer sync persists a shape through the receiving tab", async ({ page, request }) => {
  const workspaceId = await createWorkspace(page, `Canvas peer ${Date.now()}`);
  const peer = await page.context().newPage();

  try {
    // Finish the first tab's initial Note normalization before another editor
    // opens the same Workspace. The behavior under test is Canvas peer sync,
    // not a concurrent first-load Note migration.
    await waitSaved(page);

    await page.route(`**/api/workspaces/${workspaceId}/canvas`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.abort();
        return;
      }
      await route.continue();
    });

    await peer.goto(`/workspaces/${workspaceId}`);
    await expect(peer.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await waitSaved(peer);

    await Promise.all([openCanvas(page), openCanvas(peer)]);

    const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
    const canvas = page.locator(".excalidraw__canvas.interactive");
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Canvas did not render");

    await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.mouse.move(bounds.x + 180, bounds.y + 160);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 330, bounds.y + 250, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => {
      const response = await request.get(`/api/workspaces/${workspaceId}`);
      if (!response.ok()) return 0;
      const current = await response.json() as {
        canvas: { data: { elements?: Array<{ type?: string; isDeleted?: boolean }> } };
      };
      return (current.canvas.data.elements ?? [])
        .filter((element) => !element.isDeleted && element.type === "rectangle")
        .length;
    }, { timeout: 12_000 }).toBe(1);
  } finally {
    await peer.close();
    await deleteWorkspace(request, workspaceId);
    await request.delete(`/api/trash/${workspaceId}`).catch(() => undefined);
  }
});
