import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("Settings replaces floating backup with a data and recovery panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Backups", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Use (dark|light) theme$/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Notespace settings" }).click();

  // Radix names the dialog from DialogTitle ("Settings"), not the wrapper aria-label.
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(settings.getByRole("button", { name: /^Use (dark|light) theme$/ })).toBeVisible();
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("heading", { name: "Data & backup" })).toBeVisible();
  const exportLink = settings.getByRole("link", { name: "Export ZIP" });
  await expect(exportLink).toHaveAttribute("href", "/api/backup");
  await expect(settings.getByText("Verified SQLite snapshots are available in the Windows desktop app.")).toBeVisible();

  await settings.getByRole("button", { name: "General" }).click();
  await expect(settings.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await settings.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toHaveCount(0);
});

test("Settings is accessible from an open Workspace, without a floating backup", async ({ page, request }) => {
  const response = await request.post("/api/workspaces", { data: { title: `Settings navigation ${Date.now()}` } });
  expect(response.status()).toBe(201);
  const item = await response.json() as { id: string };
  try {
    await page.goto(`/workspaces/${item.id}`);
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await page.getByRole("button", { name: "Open Notespace settings" }).click();
    await expect(page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="Desktop backup and recovery"]')).toHaveCount(0);
  } finally {
    await deleteWorkspace(request, item.id);
    await request.delete(`/api/trash/${item.id}`).catch(() => undefined);
  }
});

test("Theme is only inside Settings on Home, Inbox and Today", async ({ page }) => {
  for (const path of ["/", "/inbox", "/today"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: /^Use (dark|light) theme$/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Open Notespace settings" }).click();
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings.getByRole("heading", { name: "Appearance" })).toBeVisible();
    const toggle = settings.getByRole("button", { name: /^Use (dark|light) theme$/ });
    const initial = await toggle.innerText();
    await toggle.click();
    await expect(toggle).not.toHaveText(initial);
    await settings.getByRole("button", { name: "Close settings" }).click();
  }
});
