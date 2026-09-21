import { expect, test } from "@playwright/test";

test.describe("Production-Safe Navigation & Reload", () => {
  test("direct navigation and reload on category detail (/categories/:id)", async ({
    page,
    request,
  }) => {
    const title = `Category Direct ${Date.now()}`;
    const res = await request.post("/api/categories", {
      data: { title },
    });
    expect(res.status()).toBe(201);
    const category = await res.json();

    try {
      await page.goto(`/categories/${category.id}`);
      await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
    } finally {
      await request.delete(`/api/categories/${category.id}`);
    }
  });

  test("direct navigation and reload on workspace (/workspaces/:id)", async ({
    page,
    request,
  }) => {
    const title = `Workspace Direct ${Date.now()}`;
    const res = await request.post("/api/workspaces", {
      data: { title },
    });
    expect(res.status()).toBe(201);
    const workspace = await res.json();

    const assertWorkspaceLoaded = async () => {
      await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
      await expect(page.locator(".workspace-header")).toBeVisible();
      const switcher = page.locator('summary[aria-label="Switch workspace"]');
      await expect(switcher).toContainText(title);
      await switcher.click();
      const options = page.getByRole("listbox", { name: "Workspaces in this category" });
      await expect(options.getByRole("option", { selected: true })).toHaveText(title);
      await switcher.click();
    };

    try {
      await page.goto(`/workspaces/${workspace.id}`);
      await assertWorkspaceLoaded();

      await page.reload();
      await assertWorkspaceLoaded();

      // Legacy browser URLs remain a compatibility redirect only.
      await page.goto(`/projects/${workspace.id}`);
      await expect(page).toHaveURL(new RegExp(`/workspaces/${workspace.id}$`));
      await assertWorkspaceLoaded();
    } finally {
      await request.delete(`/api/workspaces/${workspace.id}`);
      await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    }
  });
});
