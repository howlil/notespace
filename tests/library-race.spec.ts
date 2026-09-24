import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical latest Library category selection wins over stale responses", async ({ page, request }) => {
  const suffix = Date.now();
  const categoryAResponse = await request.post("/api/categories", {
    data: { title: `Race A ${suffix}` },
  });
  const categoryBResponse = await request.post("/api/categories", {
    data: { title: `Race B ${suffix}` },
  });
  expect(categoryAResponse.status()).toBe(201);
  expect(categoryBResponse.status()).toBe(201);
  const categoryA = await categoryAResponse.json();
  const categoryB = await categoryBResponse.json();

  const workspaceAResponse = await request.post("/api/workspaces", {
    data: { title: `Workspace A ${suffix}`, categoryId: categoryA.id },
  });
  const workspaceBResponse = await request.post("/api/workspaces", {
    data: { title: `Workspace B ${suffix}`, categoryId: categoryB.id },
  });
  expect(workspaceAResponse.status()).toBe(201);
  expect(workspaceBResponse.status()).toBe(201);
  const workspaceA = await workspaceAResponse.json();
  const workspaceB = await workspaceBResponse.json();

  let releaseCategoryA: (() => void) | undefined;
  let markCategoryAStarted: (() => void) | undefined;
  const categoryAStarted = new Promise<void>((resolve) => {
    markCategoryAStarted = resolve;
  });
  const categoryAGate = new Promise<void>((resolve) => {
    releaseCategoryA = resolve;
  });

  try {
    await page.goto("/");

    await page.route(`**/api/categories/${categoryA.id}/workspaces?*`, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("limit") !== "50") {
        await route.continue();
        return;
      }
      markCategoryAStarted?.();
      await categoryAGate;
      await route.continue();
    });

    await page.getByRole("button").filter({ hasText: categoryA.title }).click();
    await categoryAStarted;

    await page.getByRole("button").filter({ hasText: categoryB.title }).click();
    await expect(page.getByRole("link", { name: `Open ${workspaceB.title}` })).toBeVisible();

    releaseCategoryA?.();
    await page.waitForTimeout(250);

    await expect(page).toHaveURL(new RegExp(`category=${categoryB.id}`));
    await expect(page.getByRole("link", { name: `Open ${workspaceB.title}` })).toBeVisible();
    await expect(page.getByRole("link", { name: `Open ${workspaceA.title}` })).toHaveCount(0);
  } finally {
    releaseCategoryA?.();
    await deleteWorkspace(request, workspaceA.id);
    await deleteWorkspace(request, workspaceB.id);
    await request.delete(`/api/trash/${workspaceA.id}`).catch(() => undefined);
    await request.delete(`/api/trash/${workspaceB.id}`).catch(() => undefined);
    await request.delete(`/api/categories/${categoryA.id}`).catch(() => undefined);
    await request.delete(`/api/categories/${categoryB.id}`).catch(() => undefined);
  }
});
