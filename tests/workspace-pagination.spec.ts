import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("Category page navigation retains one listing snapshot across a remote rename", async ({ page, request }) => {
  const suffix = Date.now();
  const categoryResponse = await request.post("/api/categories", {
    data: { title: `Snapshot Navigation ${suffix}` },
  });
  expect(categoryResponse.status()).toBe(201);
  const category = await categoryResponse.json() as { id: string };
  const workspaces: Array<{ id: string; title: string }> = [];
  try {
    for (let i = 0; i < 51; i++) {
      const title = `Page ${String(i).padStart(3, "0")} ${suffix}`;
      const response = await request.post("/api/workspaces", {
        data: { title, categoryId: category.id },
      });
      expect(response.status()).toBe(201);
      workspaces.push(await response.json() as { id: string; title: string });
    }

    await page.goto(`/?category=${category.id}`);
    const pagination = page.getByRole("navigation", { name: "Workspace pages" });
    const firstLink = page.getByRole("link", { name: `Open ${workspaces[0].title}` });
    const lastLink = page.getByRole("link", { name: `Open ${workspaces[50].title}` });
    await expect(firstLink).toBeVisible();
    await expect(pagination).toContainText("1–50 of 51");

    await pagination.getByRole("button", { name: "Next" }).click();
    await expect(lastLink).toBeVisible();
    await expect(pagination).toContainText("51–51 of 51");

    // Move the off-page entry across the title-order boundary.
    const rename = await request.patch(`/api/workspaces/${workspaces[50].id}/title`, {
      data: { title: `Page -1 ${suffix}`, expectedTitle: workspaces[50].title },
    });
    expect(rename.status()).toBe(200);

    await pagination.getByRole("button", { name: "Previous" }).click();
    await expect(firstLink).toBeVisible();
    await expect(pagination).toContainText("1–50 of 51");

    await pagination.getByRole("button", { name: "Next" }).click();
    await expect(lastLink).toBeVisible();
    await expect(pagination).toContainText("51–51 of 51");

    // A 409 when returning to offset zero must restart, not trap the UI
    // with a stale token and a Retry button that repeats the same request.
    const categoryPath = `**/api/categories/${category.id}/workspaces?*`;
    let expiredOnce = false;
    await page.route(categoryPath, async (route) => {
      const params = new URL(route.request().url()).searchParams;
      const snapshot = params.get("snapshot");
      if (!expiredOnce && snapshot && snapshot !== "start" && !params.get("offset")) {
        expiredOnce = true;
        await route.fulfill({ status: 409, contentType: "application/json", body: '{"error":"Snapshot expired"}' });
        return;
      }
      await route.continue();
    });
    await pagination.getByRole("button", { name: "Previous" }).click();
    await expect(page.getByRole("link", { name: `Open Page -1 ${suffix}` })).toBeVisible();
    expect(expiredOnce).toBe(true);
    await page.unroute(categoryPath);

    // Explicit re-filtering also starts a fresh traversal.
    await page.getByRole("combobox", { name: "Sort category workspaces" }).selectOption("name");
    await expect(page.getByRole("link", { name: `Open Page -1 ${suffix}` })).toBeVisible();
  } finally {
    for (const workspace of workspaces) {
      await deleteWorkspace(request, workspace.id).catch(() => undefined);
      await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    }
    await request.delete(`/api/categories/${category.id}`).catch(() => undefined);
  }
});
