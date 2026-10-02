import { expect, test } from "@playwright/test";

test("Workspace creation keeps whitespace-only input disabled", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /New workspace/ }).first().click();

  const input = page.getByRole("textbox", { name: "Workspace title" });
  await input.fill("   \n  ");
  await input.press("Enter");

  await expect(input).toBeVisible();
});

test("Workspace creation rejects an oversized title without creating partial state", async ({ page, request }) => {
  const title = `oversized-${"x".repeat(161)}`;
  await page.goto("/");
  await page.getByRole("button", { name: /New workspace/ }).first().click();

  const input = page.getByRole("textbox", { name: "Workspace title" });
  await input.fill(title);
  await input.press("Enter");

  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(input).toBeVisible();

  const workspaces = await request.get("/api/workspaces?limit=100");
  expect(workspaces.ok()).toBe(true);
  const body = await workspaces.json() as { items: Array<{ title: string }> };
  expect(body.items.some((item) => item.title === title)).toBe(false);
});
