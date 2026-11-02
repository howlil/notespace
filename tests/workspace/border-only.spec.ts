import { expect, test, cleanupWorkspace, createViaAPI } from "./fixtures";

test("@critical Canvas controls remain border-only and usable with the shared shell", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Canvas chrome ${Date.now()}`);
  try {
    const tools = page.getByRole("toolbar", { name: "Canvas tools" });
    const canvas = page.locator(".notespace-canvas-surface");
    await expect(tools).toBeVisible();
    await expect(tools).toHaveCSS("border-top-width", "1px");
    await expect(tools).toHaveClass(/shadow-none/);
    const bounds = await canvas.boundingBox();
    const surface = await page.locator(".excalidraw__canvas.interactive").boundingBox();
    expect(bounds?.height).toBeGreaterThan(250);
    expect(surface?.height).toBeGreaterThan(250);
    await expect(page.getByRole("toolbar", { name: "Canvas view controls" })).toBeVisible();
    await expect(page.getByRole("separator", { name: /Resize horizontal panes|Resize vertical panes/ })).toHaveCount(0);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
