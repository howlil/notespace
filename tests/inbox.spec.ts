import { expect, test } from "@playwright/test";

function localDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("Inbox captures standalone work and moves it to Today without changing ownership", async ({ page, request }) => {
  const title = `Inbox capture ${Date.now()}`;
  const date = localDateKey();

  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();

    await page.getByRole("textbox", { name: "New inbox task" }).fill(title);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get("/api/tasks/inbox");
      if (!response.ok()) return null;
      const inbox = await response.json() as { tasks: Array<{ title: string; workspaceId?: string; plannedFor?: string }> };
      return inbox.tasks.find((task) => task.title === title) ?? null;
    }).toMatchObject({
      title,
    });

    await page.getByText(title, { exact: true }).hover();
    await page.getByRole("button", { name: `Move ${title} to Today` }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

    await expect.poll(async () => {
      const response = await request.get(`/api/tasks/today?date=${date}`);
      if (!response.ok()) return false;
      const today = await response.json() as { tasks: Array<{ title: string; workspaceId?: string; plannedFor?: string }> };
      const task = today.tasks.find((item) => item.title === title);
      return Boolean(task && !task.workspaceId && task.plannedFor === date);
    }).toBe(true);

    await page.getByRole("link", { name: "Today", exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await page.getByText(title, { exact: true }).hover();
    await page.getByRole("button", { name: `Move ${title} to Inbox` }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "Inbox", exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get("/api/tasks/inbox");
      if (!response.ok()) return false;
      const inbox = await response.json() as { tasks: Array<{ title: string; workspaceId?: string; plannedFor?: string }> };
      const task = inbox.tasks.find((item) => item.title === title);
      return Boolean(task && !task.workspaceId && !task.plannedFor);
    }).toBe(true);
  } finally {
    const response = await request.get("/api/tasks/inbox");
    if (response.ok()) {
      const inbox = await response.json() as { tasks: Array<{ id: string; title: string; version: number }> };
      for (const task of inbox.tasks) {
        if (task.title === title) {
          await request.delete(`/api/tasks/${task.id}`, {
            headers: { "If-Match": `"${task.version}"` },
          }).catch(() => undefined);
        }
      }
    }

    const todayResponse = await request.get(`/api/tasks/today?date=${date}`);
    if (todayResponse.ok()) {
      const today = await todayResponse.json() as { tasks: Array<{ id: string; title: string; workspaceId?: string; version: number }> };
      for (const task of today.tasks) {
        if (task.title === title && !task.workspaceId) {
          await request.delete(`/api/tasks/${task.id}`, {
            headers: { "If-Match": `"${task.version}"` },
          }).catch(() => undefined);
        }
      }
    }
  }
});
