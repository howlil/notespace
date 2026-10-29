import { expect, test } from "@playwright/test";

test("@critical retired Inbox deep link redirects to Home without exposing legacy creation", async ({ page, request }) => {
  const response = await request.post("/api/captures", {
    data: { content: `Historic capture ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const capture = await response.json() as { id: string };
  try {
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toHaveCount(0);
    const stored = await request.get(`/api/captures/${capture.id}`);
    expect(stored.ok()).toBe(true);
  } finally {
    const stored = await request.get(`/api/captures/${capture.id}`);
    if (stored.ok()) {
      const item = await stored.json() as { version: number; status: string };
      if (item.status === "pending") await request.delete(`/api/captures/${capture.id}`, {
        headers: { "If-Match": `"${item.version}"` },
      }).catch(() => undefined);
    }
  }
});
