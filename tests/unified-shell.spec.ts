import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("@critical shared rail navigates Library, Inbox and Today while Explorer remains optional", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  const categories = page.getByRole("navigation", { name: "Categories" });
  const toggle = rail.getByRole("button", { name: "Toggle category explorer" });

  await expect(rail).toBeVisible();
  await expect(categories).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
  await toggle.click();
  await expect(categories).toBeHidden();
  await toggle.click();
  await expect(categories).toBeVisible();

  await rail.getByRole("link", { name: "Capture Queue" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(rail.getByRole("link", { name: "Capture Queue" })).toHaveAttribute("aria-current", "page");
  await rail.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(rail.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
});

test("@critical mobile Explorer is initially closed, can be opened and dismissed by Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  const toggle = rail.getByRole("button", { name: "Toggle category explorer" });
  const categories = page.getByRole("navigation", { name: "Categories" });
  await expect(rail).toBeVisible();
  await expect(categories).toBeHidden();
  await toggle.click();
  await expect(categories).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(categories).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("@critical Create menu delegates to existing Explorer form and global capture survives page changes", async ({ page }) => {
  await page.goto("/inbox");
  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.click();
  await expect(page.getByRole("menuitem", { name: "Workspace" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Category" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();

  await create.click();
  await page.getByRole("menuitem", { name: "Category" }).click();
  await expect(page.getByRole("textbox", { name: "Category title" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/today");
  await page.keyboard.press("Control+Shift+N");
  await expect(page.getByRole("dialog", { name: "Quick capture" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("@critical Data and Backup is a single Settings tab with no rail recovery dialog", async ({ page }) => {
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(rail.getByRole("button", { name: "Data and recovery" })).toHaveCount(0);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("heading", { name: "Full-library backup" })).toBeVisible();
  await expect(settings.getByRole("link", { name: "Export ZIP" })).toHaveAttribute("href", "/api/backup");
  await expect(settings.getByRole("heading", { name: "Import Markdown vault" })).toBeVisible();
  await expect(settings.getByRole("heading", { name: "Trash" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Data & Recovery" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Close settings" }).click();
  await expect(settings).toHaveCount(0);
});

test("@critical global Create routes unorganized capture and Workspace-owned Today tasks", async ({ page }) => {
  await page.goto("/");
  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.click();
  await expect(page.getByRole("menuitem", { name: "Capture for later" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Quick capture" }).click();
  const capture = page.getByRole("dialog", { name: "Quick capture" });
  await expect(capture).toBeVisible();
  await capture.getByRole("combobox", { name: "Destination" }).selectOption("queue");
  await expect(capture.getByRole("combobox", { name: "Destination" })).toHaveValue("queue");
  await page.keyboard.press("Escape");

  await create.click();
  await page.getByRole("menuitem", { name: "Quick capture" }).click();
  await expect(capture.getByRole("combobox", { name: "Destination" })).toHaveValue("workspace");
  await expect(capture.getByRole("combobox", { name: "Capture Workspace" })).toBeVisible();
  await page.keyboard.press("Escape");

  await create.click();
  await page.getByRole("menuitem", { name: "Task in Today" }).click();
  await expect(page).toHaveURL(/\/today#new-task$/);
  await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Task Workspace" })).toBeVisible();
});

test("@critical Explorer visibility remains stable between Library, Inbox and Today", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  const toggle = rail.getByRole("button", { name: "Toggle category explorer" });
  const categories = page.getByRole("navigation", { name: "Categories" });

  await toggle.click();
  await expect(categories).toBeHidden();
  await rail.getByRole("link", { name: "Capture Queue" }).click();
  await expect(categories).toBeHidden();
  await rail.getByRole("link", { name: "Today" }).click();
  await expect(categories).toBeHidden();
  await toggle.click();
  await expect(categories).toBeVisible();
  await rail.getByRole("link", { name: "Library" }).click();
  await expect(categories).toBeVisible();
});

test("@critical Escape cancels mobile Explorer title entry without hiding Explorer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  await rail.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("menuitem", { name: "Category", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Category title" });
  await expect(input).toBeVisible();
  await input.fill("Uncommitted category");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Categories" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Toggle category explorer" })).toHaveAttribute("aria-expanded", "true");
});

test("@critical selecting Create Task twice focuses the same Today composer", async ({ page }) => {
  await page.goto("/");
  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.click();
  await page.getByRole("menuitem", { name: "Task in Today" }).click();
  const composer = page.getByRole("textbox", { name: "New task" });
  await expect(composer).toBeFocused();
  await create.click();
  await expect(composer).not.toBeFocused();
  await page.getByRole("menuitem", { name: "Task in Today" }).click();
  await expect(composer).toBeFocused();
});

test("@critical Activity runtime and dock survive Library/Inbox/Today navigation", async ({ page, request }) => {
  const title = `Cross-route activity ${Date.now()}`;
  const response = await request.post("/api/workspaces", { data: { title: `Activity owner ${Date.now()}` } });
  expect(response.status()).toBe(201);
  const workspace = await response.json() as { id: string };
  try {
    await page.goto("/today");
    await page.getByRole("textbox", { name: "Quick activity" }).fill(title);
    await page.getByRole("combobox", { name: "Activity Workspace" }).selectOption(workspace.id);
    await page.getByRole("button", { name: "Start", exact: true }).click();
    const active = page.getByRole("status", { name: "Active activity" });
    await expect(active).toContainText(title);

    const rail = page.getByRole("navigation", { name: "Primary navigation" });
    await rail.getByRole("link", { name: "Capture Queue" }).click();
    await expect(active).toContainText(title);
    await rail.getByRole("link", { name: "Library" }).click();
    await expect(active).toContainText(title);
    await rail.getByRole("link", { name: "Today" }).click();
    await expect(active).toContainText(title);

    await page.getByRole("button", { name: "Pause activity" }).click();
    await expect(page.getByRole("button", { name: "Resume activity" })).toBeVisible();
    await page.getByRole("button", { name: "Resume activity" }).click();
    await page.getByRole("button", { name: "End activity" }).click();
    await expect(active).toHaveCount(0);
  } finally {
    await deleteWorkspace(request, workspace.id).catch(() => undefined);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
    const response = await request.get("/api/activity/sessions?limit=100");
    if (response.ok()) {
      const sessions = await response.json() as Array<{ id: string; title: string }>;
      for (const session of sessions.filter(item => item.title === title)) {
        await request.delete(`/api/activity/sessions/${session.id}`).catch(() => undefined);
      }
    }
  }
});

test("@critical cancelling full-library restore never sends a destructive restore request", async ({ page }) => {
  let restoreRequests = 0;
  await page.route("**/api/backup/restore", async (route) => {
    restoreRequests += 1;
    await route.fulfill({ status: 500, body: "Unexpected restore call" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings", exact: true });
  await settings.getByRole("button", { name: "Data & backup" }).click();
  await expect(settings.getByRole("heading", { name: "Full-library backup" })).toBeVisible();
  await settings.locator('input[type="file"][accept*=".zip"]').setInputFiles({
    name: "existing-library-backup.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not an actual backup"),
  });
  const confirmation = page.getByRole("dialog", { name: "Replace the entire library?" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("replace your current categories");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmation).toHaveCount(0);
  expect(restoreRequests).toBe(0);
});

test("@critical Explorer remembers expanded categories across page navigation", async ({ page }) => {
  await page.goto("/");
  const categories = page.getByRole("navigation", { name: "Categories" });
  const expand = categories.getByRole("button", { name: /^Expand / }).first();
  await expect(expand).toBeVisible();
  const label = await expand.getAttribute("aria-label");
  const categoryName = label?.replace(/^Expand /, "") ?? "";
  await expand.click();
  await expect(categories.getByRole("button", { name: `Collapse ${categoryName}` })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Capture Queue" }).click();
  await expect(categories.getByRole("button", { name: `Collapse ${categoryName}` })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Today" }).click();
  await expect(categories.getByRole("button", { name: `Collapse ${categoryName}` })).toBeVisible();
});
