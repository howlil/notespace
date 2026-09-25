import { expect, test } from "@playwright/test";
import { deleteWorkspace, openCanvas } from "./helpers";

test("@critical same-browser Canvas peer sync renders authored state in a sibling tab", async ({ page, request }) => {
  const createdResponse = await request.post("/api/workspaces", {
    data: { title: `Canvas peer ${Date.now()}` },
  });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json() as { id: string };
  const peer = await page.context().newPage();

  try {
    // Keep the originating tab from making the sibling state observable through
    // the server. If the peer renders the code block, it arrived through the
    // BroadcastChannel owned by the Canvas feature.
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

    const localBlocks = page.locator("[data-canvas-code-block]");
    const peerBlocks = peer.locator("[data-canvas-code-block]");
    await expect(localBlocks).toHaveCount(0);
    await expect(peerBlocks).toHaveCount(0);

    await page.getByRole("toolbar", { name: "Canvas tools" })
      .getByRole("button", { name: "Code block", exact: true })
      .click();

    await expect(localBlocks).toHaveCount(1);
    await expect(peerBlocks).toHaveCount(1, { timeout: 10_000 });
  } finally {
    await peer.close();
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
