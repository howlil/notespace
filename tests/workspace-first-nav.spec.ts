import { expect, test } from "@playwright/test";

test("@critical labeled Workspace navigation keeps disclosure independent of routing", async ({ page, request }) => {
  const categoriesResponse = await request.get("/api/categories");
  expect(categoriesResponse.ok()).toBe(true);
  const categories = await categoriesResponse.json() as Array<{ id: string; title: string }>;
  expect(categories.length).toBeGreaterThan(0);
  const category = categories[0];

  await page.goto("/today");
  const destinations = page.getByRole("navigation", { name: "Workspace navigation" });
  await expect(destinations.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await expect(destinations.getByRole("link", { name: "Capture Queue" })).toHaveAttribute("href", "/inbox");

  const explorer = page.getByRole("navigation", { name: "Categories" });
  const expand = explorer.getByRole("button", { name: `Expand ${category.title}` });
  await expand.click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(explorer.getByRole("button", { name: `Collapse ${category.title}` })).toBeVisible();

  // Selecting the category title, rather than its disclosure control, navigates.
  await explorer.locator("[data-system-category]").first().locator("button").nth(1).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("category")).toBe(category.id);
  await expect(destinations.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
});

test("Capture Queue distinguishes initial loading from an actual empty result", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/captures", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await pending;
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("status").filter({ hasText: "Loading Capture Queue" })).toBeVisible();
    await expect(page.getByText("Queue is clear")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByText("Queue is clear")).toBeVisible();
});

test("Capture Queue exposes retryable load failure instead of false empty state", async ({ page }) => {
  await page.route("**/api/captures", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"offline"}' });
  });
  await page.goto("/inbox");
  await expect(page.getByRole("alert").filter({ hasText: "Queue could not be loaded" })).toBeVisible();
  await expect(page.getByText("Queue is clear")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
});
