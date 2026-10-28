import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

async function openSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /Search Notespace/ }).click();
  await page.getByRole("button", { name: "Settings & Data" }).click();
}

test("Settings owns the single Data & Backup surface in Navigation v8", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Backups", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Use (dark|light) theme$/ })).toHaveCount(0);
  await openSettings(page);

  // Radix names the dialog from DialogTitle ("Settings"), not the wrapper aria-label.
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(settings.getByRole("button", { name: /^Use (dark|light) theme$/ })).toBeVisible();
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("heading", { name: "Data & backup" })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Export ZIP" })).toHaveAttribute("href", "/api/backup");
  await expect(settings.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Import Markdown vault" })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Trash" })).toBeVisible();
  await expect(settings.getByText("Verified SQLite snapshots are available in the Windows desktop app.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Data & Recovery" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Data and recovery" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toHaveCount(0);

  await openSettings(page);
  const reopened = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(reopened.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await reopened.getByRole("button", { name: "Close settings" }).click();
  await expect(reopened).toHaveCount(0);
});

test("Workspace keeps Settings in Library without duplicating the Workspace rail", async ({ page, request }) => {
  const response = await request.post("/api/workspaces", { data: { title: `Settings navigation ${Date.now()}` } });
  expect(response.status()).toBe(201);
  const item = await response.json() as { id: string };
  try {
    await page.goto(`/workspaces/${item.id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
    await expect(page.locator('[aria-label="Desktop backup and recovery"]')).toHaveCount(0);
    await page.getByRole("link", { name: "Back to library" }).click();
    await expect(page).toHaveURL(/\/$/);
    await openSettings(page);
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
  } finally {
    await deleteWorkspace(request, item.id);
    await request.delete(`/api/trash/${item.id}`).catch(() => undefined);
  }
});

test("Theme is only inside Settings on Home, Inbox and Today", async ({ page }) => {
  for (const path of ["/", "/inbox", "/today"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /^Use (dark|light) theme$/ })).toHaveCount(0);
    await openSettings(page);
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings.getByRole("heading", { name: "Appearance" })).toBeVisible();
    const toggle = settings.getByRole("button", { name: /^Use (dark|light) theme$/ });
    const initial = await toggle.innerText();
    await toggle.click();
    await expect(toggle).not.toHaveText(initial);
    await settings.getByRole("button", { name: "Close settings" }).click();
  }
});
