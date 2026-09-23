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

  test("direct navigation, sibling switching, and reload on workspace (/workspaces/:id)", async ({
    page,
    request,
  }) => {
    const title = `Workspace Direct ${Date.now()}`;
    const res = await request.post("/api/workspaces", {
      data: { title },
    });
    expect(res.status()).toBe(201);
    const workspace = await res.json();

    const siblingTitle = `Workspace Sibling ${Date.now()}`;
    const siblingRes = await request.post("/api/workspaces", {
      data: { title: siblingTitle, categoryId: workspace.categoryId },
    });
    expect(siblingRes.status()).toBe(201);
    const sibling = await siblingRes.json();

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

      const switcher = page.locator('summary[aria-label="Switch workspace"]');
      await switcher.click();
      const options = page.getByRole("listbox", { name: "Workspaces in this category" });
      const siblingOption = options.getByRole("option", { name: siblingTitle, exact: true });
      await expect(siblingOption).toBeVisible();
      await siblingOption.click();
      await expect(page).toHaveURL(new RegExp(`/workspaces/${sibling.id}$`));
      await expect(page.locator('summary[aria-label="Switch workspace"]')).toContainText(siblingTitle);

      await page.goto(`/workspaces/${workspace.id}`);
      await page.reload();
      await assertWorkspaceLoaded();

      // Legacy browser URLs remain a compatibility redirect only.
      await page.goto(`/projects/${workspace.id}`);
      await expect(page).toHaveURL(new RegExp(`/workspaces/${workspace.id}$`));
      await assertWorkspaceLoaded();
    } finally {
      for (const item of [workspace, sibling]) {
        await request.delete(`/api/workspaces/${item.id}`);
        await request.delete(`/api/trash/${item.id}`).catch(() => undefined);
      }
    }
  });
});
