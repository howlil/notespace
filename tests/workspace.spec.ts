import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function create(page: Page, title: string) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .first()
    .click();
  const titleInput = page.getByRole("textbox", { name: "Workspace title" });
  await titleInput.fill(title);
  await titleInput.press("Enter");
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
  await expect(
    page.getByRole("heading", { name: "Categories" }),
  ).toBeVisible();
  expect(failures).toEqual([]);
  await page.screenshot({
    path: "test-results/dashboard-empty.png",
    fullPage: true,
  });
  const title = "Distributed Systems";
  const id = await create(page, title);
  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(page.getByRole("button", { name: "Show workspace header" })).toBeVisible();
  await expect(page.locator(".workspace-header")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-header")).toBeVisible();
  await page.getByTitle("Rename workspace").click();
  const workspaceTitle = page.getByRole("textbox", { name: "Workspace title" });
  await workspaceTitle.fill(title);
  await workspaceTitle.press("Enter");
  await page.getByRole("button", { name: "Rename note", exact: true }).click();
  const noteTitle = page.getByRole("textbox", { name: "Note title" });
  await noteTitle.fill("Consensus notes");
  await noteTitle.press("Enter");
  await expect(page.getByText("Consensus notes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByRole("button", { name: "Rename note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note title" }).fill("Scratchpad");
  await page.getByRole("textbox", { name: "Note title" }).press("Enter");
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Delete this note?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page.getByText("Consensus notes", { exact: true })).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Workspace document" });
  await editor.pressSequentially("/heading");
  await expect(page.getByRole("listbox", { name: "Insert block" })).toBeVisible();
  await page.getByRole("option", { name: /Heading/ }).click();
  await editor.pressSequentially("Consensus");
  await editor.press("Enter");
  await editor.pressSequentially("/bullet");
  await page.getByRole("option", { name: /Bullet list/ }).click();
  await editor.pressSequentially("Raft");
  await editor.press("Enter");
  await editor.pressSequentially("Paxos");
  await editor.press("Enter");
  await editor.press("Enter");
  await editor.pressSequentially("/code");
  await page.getByRole("option", { name: /Code block/ }).click();
  await editor.pressSequentially("quorum = majority(nodes)");
  await expect(editor.locator("h2")).toHaveText("Consensus");
  await expect(editor.locator("li")).toHaveCount(2);
  await expect(editor.locator("pre")).toContainText("quorum");

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
  const separator = page.getByRole("separator", {
    name: "Resize document and canvas",
  });
  await separator.focus();
  await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "48");
  await expect(
    page.getByText("Saved", { exact: true }),
  ).toBeVisible();
  const stored = await (await request.get(`/api/projects/${id}`)).json();
  expect(
    stored.canvas.data.elements
      .filter((e: { isDeleted: boolean }) => !e.isDeleted)
      .map((e: { type: string }) => e.type),
  ).toEqual(expect.arrayContaining(["rectangle", "arrow", "text"]));
  expect(stored.document.data.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "heading" }),
      expect.objectContaining({ type: "bulletList" }),
      expect.objectContaining({ type: "codeBlock" }),
    ]),
  );
  const stableBlockIds = blockIds(stored.document.data);
  expect(stableBlockIds.length).toBeGreaterThanOrEqual(4);
  expect(new Set(stableBlockIds).size).toBe(stableBlockIds.length);
  await page.screenshot({
    path: "test-results/workspace-light.png",
    fullPage: true,
  });

  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
  const second = await create(page, "Networking");
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).not.toContainText("Consensus");
  await page
    .getByRole("link", { name: title, exact: true })
    .click();
  await expect(editor).toContainText("Consensus");
  await page.reload();
  await expect(editor).toContainText("Paxos");
  const restored = await (await request.get(`/api/projects/${id}`)).json();
  expect(blockIds(restored.document.data)).toEqual(stableBlockIds);
  await expect(page.getByRole("separator")).toHaveAttribute(
    "aria-valuenow",
    "48",
  );
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  await page.screenshot({
    path: "test-results/workspace-dark.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Back to library", exact: true })
    .click();
  await page.getByRole("button", { name: "Use light theme" }).click();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await expect(page.locator(".workspace-row")).toHaveCount(2);
  await page.getByRole("button", { name: `Actions for ${title}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await page.getByRole("button", { name: "Keep workspace" }).click();
  await expect(page.locator(".workspace-row")).toHaveCount(2);
  await page.getByRole("button", { name: `Actions for ${title}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete workspace", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete workspace", exact: true })
    .click();
  await expect(
    page.locator(".workspace-row"),
  ).toHaveCount(1);
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

test("narrow layout retains both editing surfaces without horizontal overflow", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await create(page, `Narrow ${Date.now()}`);
  await expect(
    page.getByRole("textbox", { name: "Workspace document" }),
  ).toBeVisible();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/workspace-narrow.png",
    fullPage: true,
  });
  await request.delete(`/api/projects/${id}`);
});

test("canvas selection, move, delete, pan and zoom persist", async ({
  page,
  request,
}) => {
  const id = await create(page, `Canvas mechanics ${Date.now()}`);
  const read = async () =>
    (await (await request.get(`/api/projects/${id}`)).json()).canvas.data;
  await page.getByTestId("toolbar-rectangle").locator("..").click();
  const bounds = await page
    .locator(".excalidraw__canvas.interactive")
    .boundingBox();
  if (!bounds) throw new Error("Canvas unavailable");
  const x = bounds.x + 250,
    y = bounds.y + 220;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 80, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await read()).elements.length).toBe(1);
  const before = (await read()).elements[0];
  await page.getByTestId("toolbar-selection").locator("..").click();
  await page.mouse.move(x + 60, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 40, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await read()).elements[0].x)
    .not.toBe(before.x);
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await read()).elements[0].isDeleted)
    .toBe(true);
  const viewport = (await read()).appState;
  await page
    .getByRole("radio", { name: "Hand (panning tool) — H" })
    .locator("..")
    .click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 60, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await read()).appState.scrollX)
    .not.toBe(viewport.scrollX);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -160);
  await page.keyboard.up("Control");
  await expect
    .poll(async () => (await read()).appState.zoom.value)
    .not.toBe(viewport.zoom.value);
  const saved = await read();
  await page.reload();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
  const restored = await read();
  expect(restored.appState.zoom).toEqual(saved.appState.zoom);
  expect(restored.elements[0].isDeleted).toBe(true);
  await request.delete(`/api/projects/${id}`);
});
