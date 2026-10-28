import { expect, test } from "@playwright/test";

test("Legacy Inbox deep link exposes existing captures without creating standalone Tasks", async ({ page, request }) => {
  const content = `Capture transition ${Date.now()}`;
  let captureId = "";
  try {
    const rejected = await request.post("/api/tasks", { data: { title: content } });
    expect(rejected.status()).toBe(400);

    const created = await request.post("/api/captures", { data: { content } });
    expect(created.status()).toBe(201);
    captureId = (await created.json() as { id: string }).id;
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Capture an unorganized thought" })).toHaveCount(0);
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
