import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical Library creates a category and Workspace, renames the category, and restores the tree after reload", async ({ page, request }) => {
  const categoryTitle = `E2E Category ${Date.now()}`;
  const renamedCategoryTitle = `${categoryTitle} renamed`;
  const workspaceTitle = `E2E Workspace ${Date.now()}`;
  let categoryId = "";
  let workspaceId = "";

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "New category" }).click();
    const categoryInput = page.getByRole("textbox", { name: "Category title" });
    await categoryInput.fill(categoryTitle);
    await categoryInput.press("Enter");

    const category = page.getByRole("button").filter({ hasText: categoryTitle }).first();
    await expect(category).toBeVisible();

    const categoryResponse = await request.get("/api/categories");
    expect(categoryResponse.ok()).toBe(true);
    const categories = await categoryResponse.json() as Array<{ id: string; title: string }>;
    categoryId = categories.find((item) => item.title === categoryTitle)?.id ?? "";
    expect(categoryId).not.toBe("");

    await category.dblclick();
    const renameInput = page.getByRole("textbox", { name: "Category title" });
    await renameInput.fill(renamedCategoryTitle);
    await renameInput.press("Enter");
    await expect(page.getByRole("button").filter({ hasText: renamedCategoryTitle }).first()).toBeVisible();

    await page.getByRole("button").filter({ hasText: renamedCategoryTitle }).first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "New workspace" }).click();
    const workspaceInput = page.getByRole("textbox", { name: "Workspace title" });
    await workspaceInput.fill(workspaceTitle);
    await workspaceInput.press("Enter");

    const workspaceLink = page.getByRole("link", { name: `Open ${workspaceTitle}` });
    await expect(workspaceLink).toBeVisible();
    workspaceId = new URL(await workspaceLink.getAttribute("href") ?? "", page.url()).pathname.split("/").at(-1) ?? "";
    expect(workspaceId).not.toBe("");

    await page.reload();
    await expect(page.getByRole("button").filter({ hasText: renamedCategoryTitle }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `Open ${workspaceTitle}` })).toBeVisible();
  } finally {
    if (workspaceId) {
      await deleteWorkspace(request, workspaceId).catch(() => undefined);
      await request.delete(`/api/trash/${workspaceId}`).catch(() => undefined);
    }
    if (categoryId) await request.delete(`/api/categories/${categoryId}`).catch(() => undefined);
  }
});
