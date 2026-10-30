import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test.describe("Production-Safe Navigation & Reload", () => {
  test("legacy category URLs redirect to the dashboard category filter", async ({
    page,
    request,
  }) => {
    const categoryTitle = `Category Direct ${Date.now()}`;
    const categoryRes = await request.post("/api/categories", {
      data: { title: categoryTitle },
    });
    expect(categoryRes.status()).toBe(201);
    const category = await categoryRes.json();

    const workspaceTitle = `Category Workspace ${Date.now()}`;
    const workspaceRes = await request.post("/api/workspaces", {
      data: { title: workspaceTitle, categoryId: category.id },
    });
    expect(workspaceRes.status()).toBe(201);
    const workspace = await workspaceRes.json();

    try {
      await page.goto(`/categories/${category.id}`);
      await expect(page).toHaveURL(new RegExp(`/\\?category=${category.id}$`));
      await expect(page.getByRole("link", { name: `Open ${workspaceTitle}` })).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/\\?category=${category.id}$`));
      await expect(page.getByRole("link", { name: `Open ${workspaceTitle}` })).toBeVisible();
    } finally {
      await deleteWorkspace(request, workspace.id);
      await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
      await request.delete(`/api/categories/${category.id}`);
    }
  });

  test("category detail shares the Workspaces card grid and create action", async ({ page, request }) => {
    const categoryRes = await request.post("/api/categories", {
      data: { title: `Browse Category ${Date.now()}` },
    });
    expect(categoryRes.status()).toBe(201);
    const category = await categoryRes.json();
    const stamp = Date.now();
    const names = [`Beta Navigation ${stamp}`, `Alpha Navigation ${stamp}`];
    const workspaces: Array<{ id: string }> = [];
    try {
      for (const title of names) {
        const response = await request.post("/api/workspaces", {
          data: { title, categoryId: category.id },
        });
        expect(response.status()).toBe(201);
        workspaces.push(await response.json());
      }
      await page.goto(`/?category=${category.id}`);
      const list = page.getByRole("group", { name: "Category workspaces" });
      await expect(list.getByRole("link", { name: `Open ${names[0]}` })).toBeVisible();
      await expect(list.getByRole("link", { name: `Open ${names[1]}` })).toBeVisible();

      await expect(page.getByRole("heading", { name: category.title, exact: true, level: 2 })).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "Search category workspaces" })).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "Sort category workspaces" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Has notes" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Has canvas" })).toHaveCount(0);

      await list.getByRole("button", { name: "New workspace" }).click();
      const createdTitle = `Created in category ${stamp}`;
      await list.getByRole("textbox", { name: "New workspace name" }).fill(createdTitle);
      await list.getByRole("button", { name: "Create", exact: true }).click();
      const createdLink = list.getByRole("link", { name: `Open ${createdTitle}` });
      await expect(createdLink).toBeVisible();
      const href = await createdLink.getAttribute("href");
      expect(href).toMatch(/^\/workspaces\/[^/]+$/);
      const createdId = href!.split("/").pop()!;
      workspaces.push({ id: createdId });
      const createdResponse = await request.get(`/api/workspaces/${createdId}`);
      expect(createdResponse.ok()).toBe(true);
      expect((await createdResponse.json()).categoryId).toBe(category.id);
    } finally {
      for (const workspace of workspaces) {
        await deleteWorkspace(request, workspace.id);
        await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
      }
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
      await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to library" })).toBeVisible();
      await expect(page.locator(".workspace-header")).toHaveCount(0);
    };

    try {
      await page.goto(`/workspaces/${workspace.id}`);
      await assertWorkspaceLoaded();

      // Workspaces are selected in Library, never from a duplicate workspace toolbar.
      await page.getByRole("link", { name: "Back to library" }).click();
      const siblingLink = page.getByRole("link", { name: `Open ${siblingTitle}` });
      await expect(siblingLink).toBeVisible();
      await siblingLink.click();
      await expect(page).toHaveURL(new RegExp(`/workspaces/${sibling.id}$`));
      await assertWorkspaceLoaded();

      await page.goto(`/workspaces/${workspace.id}`);
      await page.reload();
      await assertWorkspaceLoaded();

      // Legacy browser URLs remain a compatibility redirect only.
      await page.goto(`/projects/${workspace.id}`);
      await expect(page).toHaveURL(new RegExp(`/workspaces/${workspace.id}$`));
      await assertWorkspaceLoaded();
    } finally {
      for (const item of [workspace, sibling]) {
        await deleteWorkspace(request, item.id);
        await request.delete(`/api/trash/${item.id}`).catch(() => undefined);
      }
    }
  });
});
