import { expect, test } from "@playwright/test";

test("@critical retired Activity surface stays hidden while the legacy API remains readable", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Activity" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Activity, today/ })).toHaveCount(0);
  const response = await request.get("/api/activity/sessions?limit=100");
  expect(response.ok()).toBe(true);
  const sessions = await response.json() as Array<{ id: string; title: string }>;
  expect(Array.isArray(sessions)).toBe(true);
});
