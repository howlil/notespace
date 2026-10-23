import { expect, test } from "@playwright/test";

test("@critical Capture Queue creates and edits pending items without standalone Tasks", async ({ page, request }) => {
  const first = `M2 Queue ${Date.now()}`;
  let id = "";
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
    const field = page.getByRole("textbox", { name: "Capture an unorganized thought" });
    await field.fill(first);
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(page.getByText(first, { exact: true })).toBeVisible();
    const data = await (await request.get("/api/captures")).json() as Array<{ id: string; content: string; version: number }>;
    id = data.find((item) => item.content === first)?.id ?? "";
    expect(id).not.toBe("");

    await page.getByRole("button", { name: `Edit capture ${id}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit capture" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Captured content" }).fill(first + " revised");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(first + " revised", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(first + " revised", { exact: true })).toBeVisible();
  } finally {
    if (id) {
      const res = await request.get(`/api/captures/${id}`);
      if (res.ok()) {
        const item = await res.json() as { version: number; status: string };
        if (item.status === "pending") await request.delete(`/api/captures/${id}`, { headers: { "If-Match": `"${item.version}"` } });
      }
    }
  }
});

test("Quick Capture can save to Queue without a Workspace", async ({ page, request }) => {
  const content = `Queue from quick capture ${Date.now()}`;
  let id = "";
  try {
    await page.goto("/");
    await page.keyboard.press("Control+Shift+N");
    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("queue");
    await dialog.getByRole("textbox", { name: "Capture", exact: true }).fill(content);
    await dialog.getByRole("button", { name: "Save to Queue" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    const pending = await (await request.get("/api/captures")).json() as Array<{ id: string; content: string; version: number }>;
    id = pending.find((x) => x.content === content)?.id ?? "";
    expect(id).not.toBe("");
  } finally {
    if (id) {
      const res = await request.get(`/api/captures/${id}`);
      if (res.ok()) {
        const item = await res.json() as { version: number; status: string };
        if (item.status === "pending") await request.delete(`/api/captures/${id}`, { headers: { "If-Match": `"${item.version}"` } });
      }
    }
  }
});
