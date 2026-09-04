import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function create(page: Page, title: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /New workspace/ })
    .first()
    .click();
  const titleInput = page.getByRole("textbox", { name: "Workspace title" });
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: title }).first().click();
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toBeVisible();
  return page.url().split("/").at(-1)!;
}

function blockIds(snapshot: { content: Array<{ attrs?: { blockId?: string }; content?: Array<{ attrs?: { blockId?: string } }> }> }) {
  return snapshot.content.flatMap((block) => [
    block.attrs?.blockId,
    ...(block.content?.map((child) => child.attrs?.blockId) ?? []),
  ]).filter(Boolean);
}

async function openPaneMenu(page: Page) {
  const details = page.locator("details.pane-actions").first();
  const open = await details.getAttribute("open");
  if (open === null) {
    await page.locator('summary[aria-label^="Actions for"]').first().click();
  }
}

async function openCanvas(page: Page) {
  await openPaneMenu(page);
  await page.getByRole("button", { name: "Open Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
}

test("create → structured note + canvas → switch → reload → delete", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  const failures: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) =>
    failures.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Recent workspaces", exact: true })).toBeVisible();
  expect(failures).toEqual([]);
  const title = "Distributed Systems";
  const id = await create(page, title);
  await expect(page.locator(".workspace-header")).toBeVisible();
  await page.getByRole("button", { name: title, exact: true }).click();
  const workspaceTitle = page.getByRole("textbox", { name: "Workspace title" });
  await workspaceTitle.fill(title);
  await workspaceTitle.press("Enter");
  await page.locator(".pane-note-switcher > summary").first().dblclick();
  const noteTitle = page.getByRole("textbox", { name: "Note title" });
  await noteTitle.fill("Consensus notes");
  await noteTitle.press("Enter");
  await expect(page.getByText("Consensus notes", { exact: true }).first()).toBeVisible();
  await openCanvas(page);
  const editor = page.getByRole("textbox", { name: "Workspace document" });
  await editor.click();
  await editor.fill("Consensus\nRaft\nPaxos\nquorum = majority(nodes)");
  await expect(editor).toContainText("Consensus");

  await page.getByTestId("toolbar-rectangle").locator("..").click();
  const bounds = await page
    .locator(".excalidraw__canvas.interactive")
    .boundingBox();
  if (!bounds) throw new Error("Canvas did not render");
  const x = bounds.x + 240,
    y = bounds.y + 200;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 170, y + 85, { steps: 10 });
  await page.mouse.up();
  await page.getByTestId("toolbar-arrow").locator("..").click();
  await page.mouse.move(x + 90, y + 100);
  await page.mouse.down();
  await page.mouse.move(x + 90, y + 220, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId("toolbar-text").locator("..").click();
  await page.mouse.click(x + 30, y + 25);
  await page.keyboard.type("Client");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Saved", { exact: true }),
  ).toBeVisible();
  const stored = await (await request.get(`/api/projects/${id}`)).json();
  expect(
    stored.canvas.data.elements
      .filter((e: { isDeleted: boolean }) => !e.isDeleted).length,
  ).toBeGreaterThanOrEqual(1);
  expect(stored.document.data.content).toEqual(expect.any(Array));
  const stableBlockIds = blockIds(stored.document.data);
  expect(stableBlockIds.length).toBeGreaterThanOrEqual(1);
  expect(new Set(stableBlockIds).size).toBe(stableBlockIds.length);

  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
  const second = await create(page, "Networking");
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).not.toContainText("Consensus");
  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
  await page
    .getByRole("link", { name: title })
    .first()
    .click();
  await expect(editor).toContainText("Consensus");
  await page.reload();
  await expect(editor).toContainText("Paxos");
  const restored = await (await request.get(`/api/projects/${id}`)).json();
  expect(blockIds(restored.document.data)).toEqual(stableBlockIds);
  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
  await expect(page.locator(".workspace-library-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Expand Uncategorized", exact: true }).click();
  await page.getByRole("link", { name: title, exact: true }).first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".workspace-library-row")).toHaveCount(1);
  expect((await request.get(`/api/projects/${id}`)).status()).toBe(404);
  await request.delete(`/api/projects/${second}`);
  expect(errors).toEqual([]);
});

test("failed autosave blocks navigation and retries without losing content", async ({
  page,
  request,
}) => {
  const id = await create(page, `Recovery ${Date.now()}`);
  await page.route("**/api/projects/*", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Storage temporarily unavailable" }),
      });
    else await route.continue();
  });
  await page
    .getByRole("textbox", { name: "Workspace document" })
    .fill("Keep this thought");
  await expect(page.getByRole("alert")).toContainText(
    "Storage temporarily unavailable",
  );
  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(id));
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toHaveText("Keep this thought");
  await page.unroute("**/api/projects/*");
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(
    page.getByText("Saved", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toHaveText("Keep this thought");
  await request.delete(`/api/projects/${id}`);
});

test("pane tree splits right and down, exposes maximize, and persists layout", async ({ page, request }) => {
  const id = await create(page, `Pane tree ${Date.now()}`);
  try {
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole("button", { name: "New note", exact: true }).click();
    }
    for (const direction of ["Split right", "Split down"] as const) {
      await openPaneMenu(page);
      await page.getByRole("button", { name: direction, exact: true }).click();
    }
    await expect(page.locator(".authoring-pane")).toHaveCount(4);
    await openPaneMenu(page);
    await expect(page.getByRole("button", { name: "Maximize pane", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Maximize split", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Maximize split", exact: true }).click();
    await expect(page.locator(".workspace-main.is-focus-mode")).toBeVisible();
    await expect(page.locator(".workspace-header")).toBeHidden();
    await expect(page.locator(".focus-mode-timer .study-indicator")).toBeVisible();
    await page.getByRole("button", { name: "Restore layout", exact: false }).click();
    await expect.poll(async () => (await (await request.get(`/api/projects/${id}`)).json()).notes.length).toBe(4);
    await page.reload();
    await expect(page.locator(".authoring-pane")).toHaveCount(4);
  } finally {
    await request.delete(`/api/projects/${id}`);
  }
});

test("narrow layout retains both editing surfaces without horizontal overflow", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await create(page, `Narrow ${Date.now()}`);
  await openCanvas(page);
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toBeVisible();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await request.delete(`/api/projects/${id}`);
});

test("Canvas pane content persists independently from pane layout", async ({
  page,
  request,
}) => {
  const id = await create(page, `Canvas mechanics ${Date.now()}`);
  await openCanvas(page);
  await page.reload();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
  await expect(page.getByRole("region", { name: "Canvas pane" })).toBeVisible();
  await request.delete(`/api/projects/${id}`);
});
