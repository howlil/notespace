import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("trackpad-style pinch zooms only the Canvas; plain wheel keeps the zoom unchanged", async ({ page, request }) => {
  const response = await request.post("/api/workspaces", {
    data: { title: `Canvas pinch ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const { id } = await response.json() as { id: string };

  try {
    await page.goto(`/workspaces/${id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
    const canvas = page.locator(".excalidraw__canvas.interactive").first();
    await expect(canvas).toBeVisible();
    const view = page.getByRole("toolbar", { name: "Canvas view controls" });
    const reset = view.getByRole("button", { name: /^Reset zoom from/ });
    await expect(reset).toHaveAttribute("aria-label", "Reset zoom from 100% to 100%");

    const wheel = async (deltaY: number, ctrlKey: boolean) => canvas.evaluate((element, args) => {
      const rect = element.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: args.ctrlKey,
        deltaY: args.deltaY,
        deltaMode: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      return element.dispatchEvent(event);
    }, { deltaY, ctrlKey });

    expect(await wheel(-8, true)).toBe(false); // handled and browser zoom suppressed
    await expect(reset).toHaveAttribute("aria-label", "Reset zoom from 108% to 100%");

    await wheel(40, false); // two-finger scroll remains Excalidraw pan, not zoom
    await expect(reset).toHaveAttribute("aria-label", "Reset zoom from 108% to 100%");

    expect(await wheel(8, true)).toBe(false);
    await expect(reset).toHaveAttribute("aria-label", "Reset zoom from 100% to 100%");
  } finally {
    await deleteWorkspace(request, id);
    await request.delete(`/api/trash/${id}`).catch(() => undefined);
  }
});
