import { test, expect } from "@playwright/test";
import {
  createWorkspace,
  waitSaved,
  goHome,
  deleteWorkspace,
  capture,
} from "./helpers";

test.describe("Home / Dashboard", () => {
  test("home: empty state renders correctly with core hierarchy", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Knowledge, organized." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent workspaces", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Categories" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /New workspace/ }),
    ).toBeVisible();

    await capture(page, "home-empty-state");
    expect(errors).toEqual([]);
  });

  test("home: global search opens with Ctrl+K and searches", async ({
    page,
    request,
  }) => {
    const wsName = `Search Target ${Date.now()}`;
    const wsId = await createWorkspace(page, wsName);

    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.click();
    await editor.fill("Testing the global search functionality");
    await waitSaved(page);

    await goHome(page);

    await page.keyboard.press("Control+K");
    const searchInput = page.getByRole("textbox", { name: "Search Notespace" });
    await expect(searchInput).toBeFocused();
    await searchInput.fill(wsName);

    const searchResult = page.getByText(wsName).first();
    await expect(searchResult).toBeVisible();
    await searchResult.click();

    await expect(page).toHaveURL(new RegExp(wsId));
    await capture(page, "home-search-result-navigation");

    await deleteWorkspace(request, wsId);
  });

  test("home: recent workspaces appear after creation", async ({
    page,
    request,
  }) => {
    const wsIds: string[] = [];
    const names = [
      `Recent A ${Date.now()}`,
      `Recent B ${Date.now()}`,
      `Recent C ${Date.now()}`,
    ];

    try {
      for (const name of names) {
        const id = await createWorkspace(page, name);
        wsIds.push(id);
        await goHome(page);
      }

      for (const name of names) {
        await expect(
          page.getByRole("link", { name }).first(),
        ).toBeVisible();
      }

      await capture(page, "home-recent-workspaces");
    } finally {
      for (const id of wsIds) {
        await deleteWorkspace(request, id);
      }
    }
  });

  test("home: sidebar collapse and expand works", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("navigation", { name: "Categories" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(
      page
        .getByRole("button", { name: "Expand sidebar", exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Categories" }),
    ).toHaveCount(0);

    await capture(page, "sidebar-collapsed");

    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("navigation", { name: "Categories" }),
    ).toBeVisible();

    await capture(page, "sidebar-expanded");
  });

  test("home: workspace creation stays on library page", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const title = `Library Creation ${Date.now()}`;
    await page
      .getByRole("button", { name: /New workspace/ })
      .first()
      .click();
    const titleInput = page.getByRole("textbox", { name: "Workspace title" });
    await titleInput.fill(title);
    await titleInput.press("Enter");

    // Should stay on library page after creation
    await expect(page).toHaveURL(/\/$/);
    const wsLink = page.getByRole("link", { name: title }).first();
    await expect(wsLink).toBeVisible();

    // Navigate into it
    await wsLink.click();
    await expect(
      page.getByRole("textbox", { name: "Workspace document" }),
    ).toBeVisible();

    const wsId = page.url().split("/").at(-1)!;
    await deleteWorkspace(request, wsId);
  });
});
