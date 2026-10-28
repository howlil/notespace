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
  await expect(settings.getByRole("button", { name: "Restore library backup" })).toBeVisible();
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

test("@critical Settings cannot dismiss while portable restore is in flight", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("button", { name: "Restore library backup" })).toBeEnabled();

  // The request is held at the transport boundary. It must never reach SQLite:
  // we are testing modal ownership and mutation lifecycle, not backup semantics.
  let notifyStarted = () => {};
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/backup/restore", async (route) => {
    notifyStarted();
    await pending;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Simulated restore unavailable" }),
    });
  });

  await settings.locator('input[type="file"][accept*=".zip"]').setInputFiles({
    name: "restore-in-flight.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not a real archive; intercepted before persistence"),
  });
  const confirmation = page.getByRole("dialog", { name: "Replace the entire library?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Replace library" }).click();

  try {
    await started;
    await expect(settings.getByRole("button", { name: "Close settings" })).toBeDisabled();
    await expect(settings.getByRole("link", { name: "Recover Captures and unassigned Tasks" })).toHaveAttribute("aria-disabled", "true");
    await expect(settings.getByRole("link", { name: "Review scheduled Tasks" })).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("button", { name: "General" })).toBeDisabled();
  } finally {
    release();
  }

  await expect(settings.getByRole("button", { name: "Close settings" })).toBeEnabled();
  await expect(settings.getByRole("button", { name: "General" })).toBeEnabled();
  await settings.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toHaveCount(0);
});

test("@critical historical Capture and Task records remain reachable only through Settings recovery links", async ({ page, request }) => {
  const stamp = Date.now();
  const captureContent = `Recovery capture ${stamp}`;
  const captureResponse = await request.post("/api/captures", { data: { content: captureContent } });
  expect(captureResponse.status()).toBe(201);
  const capture = await captureResponse.json() as { id: string };
  const workspaceResponse = await request.post("/api/workspaces", { data: { title: `Recovery owner ${stamp}` } });
  expect(workspaceResponse.status()).toBe(201);
  const workspace = await workspaceResponse.json() as { id: string };
  const scheduledTitle = `Recovery scheduled Task ${stamp}`;
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const taskResponse = await request.post(`/api/workspaces/${workspace.id}/tasks`, { data: { title: scheduledTitle, plannedFor: today } });
  expect(taskResponse.status()).toBe(201);
  try {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Recover Captures and unassigned Tasks" })).toHaveCount(0);
    await openSettings(page);
    let settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("button", { name: "Data & backup" }).click();
    await expect(settings.getByRole("heading", { name: "Historical recovery" })).toBeVisible();
    await settings.getByRole("link", { name: "Recover Captures and unassigned Tasks" }).click();
    await expect(settings).toHaveCount(0);
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByText(captureContent, { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Capture an unorganized thought" })).toHaveCount(0);

    await openSettings(page);
    settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("button", { name: "Data & backup" }).click();
    await settings.getByRole("link", { name: "Review scheduled Tasks" }).click();
    await expect(settings).toHaveCount(0);
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByText(scheduledTitle, { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "New task", exact: true })).toHaveCount(0);
  } finally {
    const current = await request.get(`/api/captures/${capture.id}`);
    if (current.ok()) {
      const item = await current.json() as { version: number; status: string };
      if (item.status === "pending") await request.delete(`/api/captures/${capture.id}`, { headers: { "If-Match": `"${item.version}"` } }).catch(() => undefined);
    }
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
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
