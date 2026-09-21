import { expect, test } from "@playwright/test";

test("workspace plan persists milestones and tasks across reload", async ({ page, request }) => {
  const title = `Planning ${Date.now()}`;
  const response = await request.post("/api/workspaces", { data: { title } });
  expect(response.status()).toBe(201);
  const workspace = await response.json();

  try {
    await page.goto(`/workspaces/${workspace.id}`);
    await expect(page.getByRole("button", { name: "Plan" })).toBeVisible();
    await page.getByRole("button", { name: "Plan" }).click();

    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Milestone" }).click();
    await page.getByRole("textbox", { name: "Milestone title" }).fill("Ship MVP");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Ship MVP", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add task", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Task title" }).fill("Finish planning flow");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Finish planning flow", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Complete Finish planning flow" }).click();
    await expect(page.getByRole("button", { name: "Mark Finish planning flow incomplete" })).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Plan" }).click();
    await expect(page.getByText("Ship MVP", { exact: true })).toBeVisible();
    await expect(page.getByText("Finish planning flow", { exact: true })).toBeVisible();
    await expect(page.getByText("1/1", { exact: true })).toBeVisible();
  } finally {
    await request.delete(`/api/workspaces/${workspace.id}`);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});
