import { expect, test } from "@playwright/test";

test("@critical Global Quick Capture UI and shortcut are retired without deleting Capture API records", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Quick capture" })).toHaveCount(0);
  await page.keyboard.press("Control+Shift+N");
  await expect(page.getByRole("dialog", { name: "Quick capture" })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("notespace:open-quick-capture")));
  await expect(page.getByRole("dialog", { name: "Quick capture" })).toHaveCount(0);

  const content = `Retained legacy capture ${Date.now()}`;
  const response = await request.post("/api/captures", { data: { content } });
  expect(response.status()).toBe(201);
  const captured = await response.json() as { id: string; version: number };
  try {
    const fetched = await request.get(`/api/captures/${captured.id}`);
    expect(fetched.status()).toBe(200);
    const item = await fetched.json() as { id: string; content: string; status: string };
    expect(item).toMatchObject({ id: captured.id, content, status: "pending" });
  } finally {
    const result = await request.get(`/api/captures/${captured.id}`);
    if (result.ok()) {
      const item = await result.json() as { version: number; status: string };
      if (item.status === "pending") {
        await request.delete(`/api/captures/${captured.id}`, { headers: { "If-Match": `"${item.version}"` } });
      }
    }
  }
});
