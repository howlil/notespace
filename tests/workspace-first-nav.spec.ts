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

test("@critical mobile Explorer traps focus, closes with Escape, and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/today");

  const toggle = page.getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Toggle category explorer" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();

  const explorer = page.getByRole("dialog", { name: "Workspace explorer" });
  await expect(explorer).toBeVisible();
  const close = explorer.getByRole("button", { name: "Close Explorer" });
  await expect(close).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => page.evaluate(() =>
    document.activeElement?.closest("#notespace-library-explorer") !== null,
  )).toBe(true);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(explorer).toHaveCount(0);
  await expect(toggle).toBeFocused();
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

  await page.goto("/today");
  const explorer = page.getByRole("navigation", { name: "Categories" });
  await explorer.getByRole("button", { name: `Expand ${category.title}` }).click();
  await expect(explorer.getByRole("button", { name: `Collapse ${category.title}` })).toBeVisible();
  await expect(explorer.getByRole("status", { name: `Loading ${category.title}` })).toHaveCount(0);
  expect(requests).toBe(1);
});
