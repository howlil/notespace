import { expect, test } from "@playwright/test";

type HistoricTask = {
  id: string; title: string; description: string; position: number;
  plannedFor: string | null; completedAt: string | null; version: number;
  createdAt: string; updatedAt: string;
};
const task = (id: string, overrides: Partial<HistoricTask> = {}): HistoricTask => ({
  id, title: id, description: "", position: 0, plannedFor: null, completedAt: null,
  version: 1, createdAt: "2026-10-25T08:00:00Z", updatedAt: "2026-10-25T08:00:00Z",
  ...overrides,
});

test("Capture Queue surfaces scheduled and completed unassigned Tasks after returning to tab", async ({ page }) => {
  let rows: HistoricTask[] = [];
  await page.route("**/api/tasks/unassigned", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: rows }) });
  });
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Capture Queue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tasks to organize" })).toHaveCount(0);
  rows = [
    task("Historical scheduled", { plannedFor: "2026-10-26" }),
    task("Historical completed", { completedAt: "2026-10-25T10:00:00Z" }),
  ];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("heading", { name: "Tasks to organize" })).toBeVisible();
  await expect(page.getByText("Historical scheduled", { exact: true })).toBeVisible();
  await expect(page.getByText("Historical completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move Historical scheduled to Workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move Historical completed to Workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move Historical completed to Today" })).toHaveCount(0);
});

test("Unassigned Task UI confirms committed PATCH and DELETE after response loss", async ({ page }) => {
  let saved: HistoricTask | null = task("task-existing", { title: "Original historic Task" });
  await page.route("**/api/tasks/unassigned", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tasks: saved ? [saved] : [] }) });
  });
  await page.route("**/api/tasks/task-existing", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      const body = route.request().postDataJSON() as { title: string };
      saved = { ...saved!, title: body.title, version: 2 };
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"lost response"}' });
    } else if (method === "DELETE") {
      saved = null;
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"lost response"}' });
    } else {
      await route.fulfill({ status: saved ? 200 : 404, contentType: "application/json", body: JSON.stringify(saved ?? { error: "not found" }) });
    }
  });
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Rename Original historic Task" }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Renamed historic Task");
  await page.getByRole("textbox", { name: "Task title" }).press("Enter");
  await expect(page.getByText("Renamed historic Task", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Renamed historic Task" }).click();
  await page.getByRole("dialog", { name: "Delete this task?" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Renamed historic Task", { exact: true })).toHaveCount(0);
});
