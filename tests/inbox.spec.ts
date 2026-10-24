import { expect, test } from "@playwright/test";

test("Inbox routes new unsorted work to Capture Queue, not standalone Tasks", async ({ page, request }) => {
  const content = `Legacy Inbox transition ${Date.now()}`;
  let captureId = "";
  try {
    const rejected = await request.post("/api/tasks", { data: { title: content } });
    expect(rejected.status()).toBe(400);

    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
    // Legacy section is hidden when there are no historical standalone Tasks.
    await page.getByRole("textbox", { name: "Capture an unorganized thought" }).fill(content);
    await page.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();

    const pending = await (await request.get("/api/captures")).json() as Array<{ id: string; content: string }>;
    captureId = pending.find((item) => item.content === content)?.id ?? "";
    expect(captureId).not.toBe("");
    const inbox = await (await request.get("/api/tasks/inbox")).json() as {
      tasks: Array<{ title: string }>;
    };
    expect(inbox.tasks.some((item) => item.title === content)).toBe(false);
    await page.reload();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
  } finally {
    if (captureId) {
      const res = await request.get(`/api/captures/${captureId}`);
      if (res.ok()) {
        const item = await res.json() as { version: number; status: string };
        if (item.status === "pending") {
          await request.delete(`/api/captures/${captureId}`, {
            headers: { "If-Match": `"${item.version}"` },
          }).catch(() => undefined);
        }
      }
    }
  }
});
