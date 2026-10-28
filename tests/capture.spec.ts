import { expect, test } from "@playwright/test";
import { deleteWorkspace } from "./helpers";

test("Quick Capture creates a durable Markdown note and remembers its target workspace", async ({ page, request }) => {
  const title = `Capture target ${Date.now()}`;
  const createdResponse = await request.post("/api/workspaces", { data: { title } });
  expect(createdResponse.status()).toBe(201);
  const workspace = await createdResponse.json() as { id: string; title: string };

  try {
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
    await page.keyboard.press("Control+Shift+N");

    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox", { name: "Capture Workspace" }).selectOption(workspace.id);
    await dialog.getByRole("textbox", { name: "Note" }).fill(
      "## MVCC in PostgreSQL\n\nSnapshots keep readers isolated from concurrent writers.",
    );
    await dialog.getByRole("button", { name: "Capture", exact: true }).click();

    await expect(page.getByText(`Captured to ${workspace.title}.`, { exact: true })).toBeVisible();

    await expect.poll(async () => {
      const response = await request.get(`/api/workspaces/${workspace.id}`);
      if (!response.ok()) return null;
      const current = await response.json() as {
        notes: Array<{ title: string; document: unknown }>;
      };
      return current.notes.find((note) => note.title === "MVCC in PostgreSQL") ?? null;
    }).not.toBeNull();

    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
    await page.keyboard.press("Control+Shift+N");
    const reopened = page.getByRole("dialog", { name: "Quick capture" });
    await expect(reopened).toBeVisible();
    await expect(reopened.getByRole("combobox", { name: "Capture Workspace" })).toHaveValue(workspace.id);
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});

test("Queue size limit does not restrict direct Workspace Quick Capture", async ({ page, request }) => {
  const created = await request.post("/api/workspaces", { data: { title: `Capture validation ${Date.now()}` } });
  expect(created.status()).toBe(201);
  const workspace = await created.json() as { id: string };
  try {
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
    await page.keyboard.press("Control+Shift+N");
    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    await dialog.getByRole("combobox", { name: "Capture Workspace" }).selectOption(workspace.id);
    await dialog.getByRole("textbox", { name: "Note" }).fill("a".repeat(65537));
    await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeEnabled();
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("queue");
    await expect(dialog.getByRole("button", { name: "Save to Queue" })).toBeDisabled();
    await expect(dialog.getByText("Content must fit within 64 KiB.")).toBeVisible();
    await dialog.getByRole("combobox", { name: "Destination" }).selectOption("workspace");
    await expect(dialog.getByRole("button", { name: "Capture", exact: true })).toBeEnabled();
  } finally {
    await deleteWorkspace(request, workspace.id);
    await request.delete(`/api/trash/${workspace.id}`).catch(() => undefined);
  }
});


test("@critical Quick Capture cannot use stale Workspace search results during debounce or pending request", async ({ page, request }) => {
  const stamp = Date.now();
  const firstResponse = await request.post("/api/workspaces", { data: { title: `M6 destination A ${stamp}` } });
  expect(firstResponse.status()).toBe(201);
  const first = await firstResponse.json() as { id: string; title: string };
  const secondResponse = await request.post("/api/workspaces", { data: { title: `M6 destination B ${stamp}` } });
  expect(secondResponse.status()).toBe(201);
  const second = await secondResponse.json() as { id: string; title: string };

  let releaseSearch!: () => void;
  const blockedSearch = new Promise<void>((resolve) => { releaseSearch = resolve; });
  try {
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Category explorer" })).toBeVisible();
    await page.keyboard.press("Control+Shift+N");
    const dialog = page.getByRole("dialog", { name: "Quick capture" });
    const search = dialog.getByRole("searchbox", { name: "Search workspaces" });
    const picker = dialog.getByRole("combobox", { name: "Capture Workspace" });
    const save = dialog.getByRole("button", { name: "Capture", exact: true });
    const noteTitle = `M6 search-safe note ${stamp}`;

    await dialog.getByRole("textbox", { name: "Note" }).fill(noteTitle);
    await search.fill(first.title);
    await expect(picker).toHaveValue(first.id);
    await expect(save).toBeEnabled();

    await page.route("**/api/workspaces?**", async (route) => {
      if (new URL(route.request().url()).searchParams.get("q") === second.title) {
        await blockedSearch;
      }
      await route.continue();
    });
    await search.fill(second.title);
    // The old result must be unusable immediately, including before debounce.
    await expect(save).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Note" }).press("Control+Enter");
    await expect(dialog).toBeVisible();
    await expect(save).toBeDisabled();

    releaseSearch();
    await expect(picker).toHaveValue(second.id);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText(`Captured to ${second.title}.`, { exact: true })).toBeVisible();

    const previous = await request.get(`/api/workspaces/${first.id}`);
    expect(previous.ok()).toBe(true);
    const workspace = await previous.json() as { notes: Array<{ title: string }> };
    expect(workspace.notes.some((note) => note.title === noteTitle)).toBe(false);
  } finally {
    releaseSearch();
    await deleteWorkspace(request, first.id);
    await deleteWorkspace(request, second.id);
    await request.delete(`/api/trash/${first.id}`).catch(() => undefined);
    await request.delete(`/api/trash/${second.id}`).catch(() => undefined);
  }
});
