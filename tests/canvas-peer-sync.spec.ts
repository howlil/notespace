import { expect, test } from "@playwright/test";
import { deleteWorkspace, openCanvas } from "./helpers";

test("@critical same-browser Canvas peer sync persists a shape through the receiving tab", async ({ page, request }) => {
  const createdResponse = await request.post("/api/workspaces", {
    data: { title: `Canvas peer ${Date.now()}` },
  });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json() as { id: string };
  const peer = await page.context().newPage();

  try {
    await page.route(`**/api/workspaces/${workspace.id}/canvas`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.abort();
        return;
      }
      await route.continue();
    });

    await Promise.all([
      page.goto(`/workspaces/${workspace.id}`),
      peer.goto(`/workspaces/${workspace.id}`),
    ]);
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
      const response = await request.get(`/api/workspaces/${workspace.id}`);
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
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
