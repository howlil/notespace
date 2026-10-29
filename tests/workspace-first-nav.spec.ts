import { expect, test } from "@playwright/test";

test("@critical categories disclose without navigation and filter Home on title selection", async ({ page, request }) => {
  const response = await request.get("/api/categories");
  expect(response.ok()).toBe(true);
  const categories = await response.json() as Array<{ id: string; title: string }>;
  const category = categories[0];
  expect(category).toBeDefined();
  await page.goto("/");
  const explorer = page.getByRole("navigation", { name: "Categories" });
  await explorer.getByRole("button", { name: `Expand ${category.title}` }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(null);
  await expect(explorer.getByRole("button", { name: `Collapse ${category.title}` })).toBeVisible();
  await explorer.getByText(category.title, { exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(category.id);
});

test("@critical mobile Home retains fixed category navigation without a toggle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Categories" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Workspace explorer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle category explorer" })).toHaveCount(0);
});

test("Expanding one category issues one Workspace fetch and shows its loading state", async ({ page, request }) => {
  const response = await request.get("/api/categories");
  expect(response.ok()).toBe(true);
  const categories = await response.json() as Array<{ id: string; title: string }>;
  const category = categories[0];
  expect(category).toBeDefined();

  let requests = 0;
  await page.route(`**/api/categories/${category.id}/workspaces?**`, async (route) => {
    requests++;
    await route.continue();
  });

  await page.goto("/");
  const explorer = page.getByRole("navigation", { name: "Categories" });
  await explorer.getByRole("button", { name: `Expand ${category.title}` }).click();
  await expect(explorer.getByRole("button", { name: `Collapse ${category.title}` })).toBeVisible();
  await expect(explorer.getByRole("status", { name: `Loading ${category.title}` })).toHaveCount(0);
  expect(requests).toBe(1);
});

test("Quick Open does not report an empty result during pending search or retryable failure", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/search?q=**", async (route) => {
    requests++;
    await route.fulfill({
      status: requests === 1 ? 503 : 200,
      contentType: "application/json",
      body: requests === 1 ? '{"error":"offline"}' : "[]",
    });
  });
  await page.goto("/");
  await page.keyboard.press("Control+k");

  const quickOpen = page.getByRole("dialog", { name: "Quick Open" });
  await expect(quickOpen).toBeVisible();
  const search = quickOpen.getByPlaceholder("Open workspace, note, block, or category…");
  await search.fill("no-results-for-quick-open-m6");
  await expect(quickOpen.getByRole("status").filter({ hasText: "Searching Notespace" })).toBeVisible();
  await expect(quickOpen.getByText("No matching knowledge.")).toHaveCount(0);
  await expect(quickOpen.getByRole("alert").filter({ hasText: "Search could not be loaded." })).toBeVisible();
  await quickOpen.getByRole("button", { name: "Retry" }).click();
  await expect(quickOpen.getByText("No matching knowledge.")).toBeVisible();
  expect(requests).toBe(2);
});

test("Category search clears after changing categories and does not hide destination workspaces", async ({ page, request }) => {
  const suffix = Date.now();
  const categoryAName = `Filter Source ${suffix}`;
  const categoryBName = `Filter Target ${suffix}`;
  const workspaceAName = `Source Workspace ${suffix}`;
  const workspaceBName = `Target Workspace ${suffix}`;
  const categories: string[] = [];
  const workspaces: string[] = [];
  try {
    for (const title of [categoryAName, categoryBName]) {
      const response = await request.post("/api/categories", { data: { title } });
      expect(response.status()).toBe(201);
      categories.push((await response.json() as { id: string }).id);
    }
    for (const [index, title] of [workspaceAName, workspaceBName].entries()) {
      const response = await request.post("/api/workspaces", {
        data: { title, categoryId: categories[index] },
      });
      expect(response.status()).toBe(201);
      workspaces.push((await response.json() as { id: string }).id);
    }

    await page.goto(`/?category=${categories[0]}`);
    const search = page.getByRole("searchbox", { name: "Search category workspaces" });
    await expect(page.getByRole("link", { name: `Open ${workspaceAName}` })).toBeVisible();
    await search.fill(`no-match-${suffix}`);
    await expect(page.getByRole("link", { name: `Open ${workspaceAName}` })).toHaveCount(0);

    await page.getByRole("navigation", { name: "Categories" })
      .getByText(categoryBName, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`category=${categories[1]}`));
    await expect(search).toHaveValue("");
    await expect(page.getByRole("link", { name: `Open ${workspaceBName}` })).toBeVisible();
  } finally {
    for (const id of workspaces) {
      await deleteWorkspace(request, id).catch(() => undefined);
      await request.delete(`/api/trash/${id}`).catch(() => undefined);
    }
    for (const id of categories) {
      await request.delete(`/api/categories/${id}`).catch(() => undefined);
    }
  }
});
