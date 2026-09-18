import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

async function createViaAPI(page: Page, request: APIRequestContext, title: string) {
  const response = await request.post("/api/workspaces", { data: { title } });
  expect(response.status()).toBe(201);
  const workspace = await response.json() as { id: string };
  await page.goto(`/workspaces/${workspace.id}`);
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  return workspace.id;
}

async function cleanup(request: APIRequestContext, id: string) {
  await request.delete(`/api/workspaces/${id}`);
  await request.delete(`/api/trash/${id}`).catch(() => undefined);
}

async function openPaneMenu(page: Page) {
  const details = page.locator("details.pane-actions").first();
  if ((await details.getAttribute("open")) === null) {
    await page.locator('summary[aria-label^="Actions for"]').first().click();
  }
}

async function selectView(page: Page, name: "Canvas" | "Note" | "Split") {
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name, exact: true }).click();
}

test("create → edit note and canvas → reload", async ({ page, request }) => {
  const title = `Distributed Systems ${Date.now()}`;
  const id = await createViaAPI(page, request, title);

  try {
    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.fill("Consensus\nRaft\nPaxos\nquorum = majority(nodes)");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await selectView(page, "Canvas");
    const canvas = page.locator(".excalidraw__canvas.interactive");
    await expect(canvas).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
    await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Canvas did not render");
    await page.mouse.move(bounds.x + 220, bounds.y + 180);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 360, bounds.y + 250, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
      canvas: { data: { elements: Array<{ isDeleted?: boolean }> } };
    };
    expect(stored.canvas.data.elements.filter((element) => !element.isDeleted).length).toBeGreaterThanOrEqual(1);

    await page.reload();
    await selectView(page, "Note");
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("Paxos");
  } finally {
    await cleanup(request, id);
  }
});

test("failed autosave blocks navigation and retry preserves content", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Recovery ${Date.now()}`);

  try {
    await page.route(`**/api/workspaces/${id}`, async (route) => {
      if (route.request().method() === "PATCH") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Storage temporarily unavailable" }),
        });
        return;
      }
      await route.continue();
    });

    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.fill("Keep this thought");
    await expect(page.getByRole("alert")).toContainText("Storage temporarily unavailable");

    await page.getByRole("link", { name: "Back to library", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${id}`));
    await expect(editor).toContainText("Keep this thought");

    await page.unroute(`**/api/workspaces/${id}`);
    await page.getByRole("button", { name: "Retry save" }).first().click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toContainText("Keep this thought");
  } finally {
    await cleanup(request, id);
  }
});

test("pane tree splits, enters focus mode, and restores layout", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Pane tree ${Date.now()}`);

  try {
    for (let index = 0; index < 2; index += 1) {
      await page.getByRole("button", { name: "New note", exact: true }).click();
    }

    await openPaneMenu(page);
    await page.getByRole("button", { name: "Split right", exact: true }).click();
    await openPaneMenu(page);
    await page.getByRole("button", { name: "Split down", exact: true }).click();
    await expect(page.locator('section[aria-label$="note pane"]')).toHaveCount(3);

    const maximize = page.getByRole("button", { name: /Maximize active (pane|split)/ });
    await expect(maximize).toBeVisible();
    await maximize.click();
    await expect(page.locator(".workspace-main.is-focus-mode")).toBeVisible();
    await expect(page.locator(".workspace-header")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.locator(".workspace-header")).toBeVisible();
  } finally {
    await cleanup(request, id);
  }
});

test("narrow split view retains note and canvas without horizontal overflow", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Narrow ${Date.now()}`);

  try {
    await selectView(page, "Split");
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await cleanup(request, id);
  }
});

test("Canvas content survives reload independently from pane layout", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Canvas mechanics ${Date.now()}`);

  try {
    await selectView(page, "Canvas");
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    await page.reload();
    await selectView(page, "Canvas");
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    await expect(page.getByRole("region", { name: "Canvas pane" })).toBeVisible();
  } finally {
    await cleanup(request, id);
  }
});


test("flowchart spawn previews, chains, auto-connects, and switches shape type", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Directional spawn ${Date.now()}`);

  try {
    await selectView(page, "Canvas");
    const canvas = page.locator(".excalidraw__canvas.interactive");
    await expect(canvas).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
    await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Canvas did not render");
    const left = bounds.x + 220;
    const top = bounds.y + 180;
    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(left + 120, top + 70, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => {
      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ type?: string; isDeleted?: boolean }> } };
      };
      return stored.canvas.data.elements.filter((element) => !element.isDeleted && element.type === "rectangle").length;
    }).toBe(1);

    const editor = page.locator(".excalidraw").first();
    await expect(editor).toBeFocused();

    const addRight = page.getByRole("button", { name: "Add connected shape right" });
    await expect(addRight).toBeVisible();
    await addRight.hover();
    await expect(page.getByText("Alt", { exact: true })).toBeVisible();

    const previewState = await (await request.get(`/api/workspaces/${id}`)).json() as {
      canvas: { data: { elements: Array<{ type?: string; isDeleted?: boolean }> } };
    };
    const previewLive = previewState.canvas.data.elements.filter((element) => !element.isDeleted);
    expect(previewLive.filter((element) => element.type === "rectangle")).toHaveLength(1);
    expect(previewLive.filter((element) => element.type === "arrow")).toHaveLength(0);

    await page.mouse.move(bounds.x + 40, bounds.y + 40);
    await editor.press("Alt+ArrowRight");

    await expect.poll(async () => {
      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ type?: string; isDeleted?: boolean }> } };
      };
      const live = stored.canvas.data.elements.filter((element) => !element.isDeleted);
      return {
        rectangles: live.filter((element) => element.type === "rectangle").length,
        arrows: live.filter((element) => element.type === "arrow").length,
      };
    }).toEqual({ rectangles: 2, arrows: 1 });

    await editor.press("Alt+ArrowRight");

    await expect.poll(async () => {
      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ type?: string; isDeleted?: boolean }> } };
      };
      const live = stored.canvas.data.elements.filter((element) => !element.isDeleted);
      return {
        rectangles: live.filter((element) => element.type === "rectangle").length,
        arrows: live.filter((element) => element.type === "arrow").length,
      };
    }).toEqual({ rectangles: 3, arrows: 2 });

    await editor.press("Tab");
    const shapeSwitcher = page.locator(".ConvertElementTypePopup");
    await expect(shapeSwitcher).toBeVisible();
    await expect(shapeSwitcher.getByRole("button", { name: "rectangle" })).toBeVisible();
    await expect(shapeSwitcher.getByRole("button", { name: "diamond" })).toBeVisible();
    await expect(shapeSwitcher.getByRole("button", { name: "ellipse" })).toBeVisible();

    await shapeSwitcher.getByRole("button", { name: "diamond" }).click();
    await expect.poll(async () => {
      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ type?: string; isDeleted?: boolean }> } };
      };
      const live = stored.canvas.data.elements.filter((element) => !element.isDeleted);
      return {
        rectangles: live.filter((element) => element.type === "rectangle").length,
        diamonds: live.filter((element) => element.type === "diamond").length,
        arrows: live.filter((element) => element.type === "arrow").length,
      };
    }).toEqual({ rectangles: 2, diamonds: 1, arrows: 2 });
  } finally {
    await cleanup(request, id);
  }
});
