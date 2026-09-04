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
      // Fresh/direct navigation to category URL
      await page.goto(`/categories/${category.id}`);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();

      // Reload directly on the category route
      await page.reload();
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    } finally {
      await request.delete(`/api/categories/${category.id}`);
    }
  });

  test("direct navigation and reload on workspace (/workspaces/:id)", async ({
    page,
    request,
  }) => {
    const title = `Workspace Direct ${Date.now()}`;
    const res = await request.post("/api/projects", {
      data: { title },
    });
    expect(res.status()).toBe(201);
    const workspace = await res.json();

    try {
      // Direct navigation to /workspaces/:id
      await page.goto(`/workspaces/${workspace.id}`);
      await expect(
        page.getByRole("textbox", { name: "Workspace document" }),
      ).toBeVisible();
      await expect(page.locator(".workspace-header")).toBeVisible();
      await expect(page.getByText(title, { exact: true })).toBeVisible();

      // Browser reload on /workspaces/:id preserves valid application state
      await page.reload();
      await expect(
        page.getByRole("textbox", { name: "Workspace document" }),
      ).toBeVisible();
      await expect(page.locator(".workspace-header")).toBeVisible();
      await expect(page.getByText(title, { exact: true })).toBeVisible();

      // Compatibility: direct navigation to /projects/:id also loads workspace
      await page.goto(`/projects/${workspace.id}`);
      await expect(
        page.getByRole("textbox", { name: "Workspace document" }),
      ).toBeVisible();
    } finally {
      await request.delete(`/api/projects/${workspace.id}`);
    }
  });
});
