import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

async function openCanvasWorkspace(page: Page, request: APIRequestContext, title: string) {
  const response = await request.post("/api/workspaces", { data: { title } });
  expect(response.status()).toBe(201);
  const workspace = await response.json() as { id: string };

  await page.goto(`/workspaces/${workspace.id}`);
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();

  return workspace.id;
}

async function cleanup(request: APIRequestContext, id: string) {
  await request.delete(`/api/workspaces/${id}`);
  await request.delete(`/api/trash/${id}`).catch(() => undefined);
}

test.describe("Canvas chrome", () => {
  test("keeps primary tools in the rail and secondary tools in More", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas chrome ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      for (const label of ["Select", "Hand", "Rectangle", "Diamond", "Ellipse", "Arrow", "Line", "Draw", "Text", "Image", "Eraser", "Code block", "Diagram", "More tools"]) {
        await expect(toolbar.getByRole("button", { name: label, exact: true })).toBeVisible();
      }
      await expect(toolbar.getByRole("button", { name: "Colors", exact: true })).toHaveCount(0);
      await expect(toolbar.getByRole("button", { name: "Canvas details", exact: true })).toHaveCount(0);

      await toolbar.getByRole("button", { name: "More tools", exact: true }).click();
      const more = page.locator('aside[aria-label="More canvas tools"]');
      await expect(more).toBeVisible();
      for (const label of ["Lasso select", "Frame", "Embed", "Laser pointer", "Bucket fill"]) {
        await expect(more.getByRole("button", { name: label, exact: true })).toBeVisible();
      }

      const view = page.getByRole("toolbar", { name: "Canvas view controls" });
      await expect(view).toBeVisible();
      await expect(view.getByRole("button", { name: "Zoom in" })).toBeVisible();
      await expect(view.getByRole("button", { name: "Zoom out" })).toBeVisible();
      await expect(view.getByRole("button", { name: "More canvas view controls" })).toBeVisible();
    } finally {
      await cleanup(request, id);
    }
  });

  test("creates arbitrary HTTPS embeds through the UI without a whitelist toast", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas embed ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      await toolbar.getByRole("button", { name: "More tools", exact: true }).click();
      const more = page.locator('aside[aria-label="More canvas tools"]');
      await expect(more).toBeVisible();
      await more.getByRole("button", { name: "Embed", exact: true }).dispatchEvent("click");

      const canvas = page.locator(".excalidraw__canvas.interactive");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("Canvas did not render");
      await page.mouse.move(bounds.x + 180, bounds.y + 130);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 700, bounds.y + 450, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.press("Control+K");

      await expect(page.getByRole("dialog", { name: "Quick Open" })).toHaveCount(0);
      const linkInput = page.getByPlaceholder("Type or paste your link here");
      await expect(linkInput).toBeVisible();
      await linkInput.fill("https://howlil.tech");
      await linkInput.press("Enter");

      const iframe = page.locator('iframe[src^="https://howlil.tech"]');
      await expect(iframe).toHaveCount(1);
      await expect(page.getByText(/Embedding this url is currently not allowed/i)).toHaveCount(0);

      const embedActions = page.getByRole("toolbar", { name: "Selected shape actions" });
      await expect(embedActions).toBeVisible();
      const interact = embedActions.getByRole("button", { name: "Interact with embed" });
      await expect(interact).toBeVisible();
      await interact.click();
      await expect(embedActions.getByRole("button", { name: "Lock embed" })).toBeVisible();

      const iframeBox = await iframe.boundingBox();
      expect(iframeBox).not.toBeNull();
      await page.mouse.click(iframeBox!.x + iframeBox!.width / 2, iframeBox!.y + iframeBox!.height / 2);
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");

      await embedActions.getByRole("button", { name: "Lock embed" }).click();
      await expect(embedActions.getByRole("button", { name: "Interact with embed" })).toBeVisible();

      await embedActions.getByRole("button", { name: "More selected shape actions" }).click();
      const embedSection = page.getByRole("region", { name: "Embed" });
      await expect(embedSection.getByRole("button", { name: "Edit embed URL" })).toBeVisible();
      await expect(embedSection.getByRole("button", { name: "Open embed source" })).toBeVisible();

      await expect(page.getByText("Saved", { exact: true })).toBeVisible();

      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ type?: string; link?: string; isDeleted?: boolean }> } };
      };
      const embed = stored.canvas.data.elements.find((candidate) => !candidate.isDeleted && candidate.type === "embeddable");
      expect(embed?.link).toBe("https://howlil.tech");
    } finally {
      await cleanup(request, id);
    }
  });

  test("code block actions live in the action bar and auto height follows wrapped source", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas code ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      await toolbar.getByRole("button", { name: "Code block", exact: true }).click();

      const block = page.locator("[data-canvas-code-block]").first();
      const actions = page.getByRole("toolbar", { name: "Code block actions" });
      await expect(block).toBeVisible();
      await expect(actions).toBeVisible();
      await expect(actions.getByRole("button", { name: "Run JavaScript" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Fit code height" })).toHaveAttribute("aria-pressed", "true");
      await expect(actions.getByRole("button", { name: /Edit code|Finish editing/ })).toHaveCount(0);
      await expect(block.getByRole("button", { name: "Run JavaScript" })).toHaveCount(0);

      const initialBox = await block.boundingBox();
      expect(initialBox?.height ?? 999).toBeLessThan(80);

      await expect.poll(async () => {
        const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
          canvas: { data: { elements: Array<{ customData?: Record<string, unknown>; isDeleted?: boolean }> } };
        };
        const element = stored.canvas.data.elements.find((candidate) => {
          const customData = candidate.customData as { notespaceCodeBlock?: { heightMode?: string } } | undefined;
          return !candidate.isDeleted && customData?.notespaceCodeBlock;
        });
        return (element?.customData as { notespaceCodeBlock?: { heightMode?: string } } | undefined)?.notespaceCodeBlock?.heightMode;
      }).toBe("auto");

      const initialStored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ height?: number; customData?: Record<string, unknown>; isDeleted?: boolean }> } };
      };
      const initialElement = initialStored.canvas.data.elements.find((candidate) => {
        const customData = candidate.customData as { notespaceCodeBlock?: unknown } | undefined;
        return !candidate.isDeleted && customData?.notespaceCodeBlock;
      });
      const initialHeight = initialElement?.height ?? 0;

      const box = await block.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

      const editor = block.getByRole("textbox", { name: "Edit code block" });
      const longValue = "abcdefghijklmnopqrstuvwxyz".repeat(12);
      const code = `const veryLong = "${longValue}"; console.log("worker-ok"); return veryLong.length;`;
      await editor.fill(code);
      await expect(editor).toHaveValue(code);
      const livePreview = block.getByLabel("Live syntax preview");
      await expect(livePreview).toContainText("veryLong");
      await expect(livePreview.locator("span[style*='color']").first()).toBeVisible();
      await editor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

      const output = page.getByLabel("Code output", { exact: true });
      await expect(output).toContainText("worker-ok");
      await expect(output).toContainText(String(longValue.length));
      await expect(output).toContainText(/Done/);

      await editor.press("Escape");
      await expect(block.getByRole("textbox", { name: "Edit code block" })).toHaveCount(0);
      const preview = block.getByLabel("Highlighted code");
      await expect(preview).toContainText("veryLong");
      const wrapping = await preview.evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        whiteSpace: getComputedStyle(node).whiteSpace,
      }));
      expect(wrapping.whiteSpace).toBe("pre-wrap");
      expect(wrapping.scrollWidth).toBeLessThanOrEqual(wrapping.clientWidth + 1);

      await expect.poll(async () => {
        const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
          canvas: { data: { elements: Array<{ height?: number; customData?: Record<string, unknown>; isDeleted?: boolean }> } };
        };
        const element = stored.canvas.data.elements.find((candidate) => {
          const customData = candidate.customData as { notespaceCodeBlock?: { code?: string; heightMode?: string } } | undefined;
          return !candidate.isDeleted && customData?.notespaceCodeBlock?.code === code;
        });
        const metadata = element?.customData as { notespaceCodeBlock?: { heightMode?: string } } | undefined;
        return {
          height: element?.height ?? 0,
          mode: metadata?.notespaceCodeBlock?.heightMode,
        };
      }).toEqual({
        height: expect.any(Number),
        mode: "auto",
      });

      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ height?: number; customData?: Record<string, unknown>; isDeleted?: boolean }> } };
      };
      const persisted = stored.canvas.data.elements.find((candidate) => {
        const customData = candidate.customData as { notespaceCodeBlock?: { code?: string } } | undefined;
        return !candidate.isDeleted && customData?.notespaceCodeBlock?.code === code;
      });
      expect(persisted?.height ?? 0).toBeGreaterThan(initialHeight);
      expect(JSON.stringify(stored.canvas.data)).not.toContain("\"stdout\"");

      await page.reload();
      await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
      const reloaded = page.locator("[data-canvas-code-block]").first();
      await expect(reloaded).toBeVisible();
      await expect(reloaded.getByLabel("Highlighted code")).toContainText("veryLong");
      await expect(page.getByLabel("Code output", { exact: true })).toHaveCount(0);
    } finally {
      await cleanup(request, id);
    }
  });

  test("directional spawn from a code block creates another code block", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas code spawn ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      await toolbar.getByRole("button", { name: "Code block", exact: true }).click();

      const blocks = page.locator("[data-canvas-code-block]");
      await expect(blocks).toHaveCount(1);
      const editor = page.locator(".excalidraw").first();
      await editor.press("Alt+ArrowRight");

      await expect(blocks).toHaveCount(2);
      await expect.poll(async () => {
        const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
          canvas: { data: { elements: Array<{ type?: string; customData?: Record<string, unknown>; isDeleted?: boolean }> } };
        };
        const live = stored.canvas.data.elements.filter((element) => !element.isDeleted);
        const codeBlocks = live.filter((element) => {
          const customData = element.customData as { notespaceCodeBlock?: unknown } | undefined;
          return !!customData?.notespaceCodeBlock;
        });
        return {
          codeBlocks: codeBlocks.length,
          arrows: live.filter((element) => element.type === "arrow").length,
        };
      }).toEqual({ codeBlocks: 2, arrows: 1 });
    } finally {
      await cleanup(request, id);
    }
  });

  test("property editing suppresses directional spawn affordances and hotkeys", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas property focus ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      const canvas = page.locator(".excalidraw__canvas.interactive");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("Canvas did not render");

      await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
      await page.mouse.move(bounds.x + 220, bounds.y + 180);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 360, bounds.y + 250, { steps: 8 });
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

      const actions = page.getByRole("toolbar", { name: "Selected shape actions" });
      await actions.getByRole("button", { name: "Drawing properties" }).click();
      await expect(page.getByRole("dialog", { name: "properties properties" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Add connected shape/ })).toHaveCount(0);

      const before = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ isDeleted?: boolean }> } };
      };
      const beforeCount = before.canvas.data.elements.filter((element) => !element.isDeleted).length;
      // Keep focus inside the contextual actions while sending the shortcut.
      // Focusing the editor would intentionally dismiss this popup via
      // useDismissablePopup before the keyboard event is delivered.
      await page.keyboard.press("Alt+ArrowRight");
      await page.waitForTimeout(200);
      const after = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: { elements: Array<{ isDeleted?: boolean }> } };
      };
      expect(after.canvas.data.elements.filter((element) => !element.isDeleted)).toHaveLength(beforeCount);

      await actions.getByRole("button", { name: "Drawing properties" }).click();
      await expect(page.getByRole("dialog", { name: "properties properties" })).toHaveCount(0);
      await expect(addRight).toBeVisible();
    } finally {
      await cleanup(request, id);
    }
  });

  test("mixed selection aggregates common actions and groups type-specific controls", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas mixed selection ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      const canvas = page.locator(".excalidraw__canvas.interactive");
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("Canvas did not render");

      await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
      await page.mouse.move(bounds.x + 180, bounds.y + 170);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 300, bounds.y + 240, { steps: 5 });
      await page.mouse.up();

      await toolbar.getByRole("button", { name: "Text", exact: true }).click();
      await page.mouse.click(bounds.x + 390, bounds.y + 210);
      await page.keyboard.type("mixed");
      await page.keyboard.press("Escape");

      await toolbar.getByRole("button", { name: "Arrow", exact: true }).click();
      await page.mouse.move(bounds.x + 220, bounds.y + 330);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 390, bounds.y + 330, { steps: 5 });
      await page.mouse.up();

      await toolbar.getByRole("button", { name: "Draw", exact: true }).click();
      await page.mouse.move(bounds.x + 470, bounds.y + 180);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 540, bounds.y + 250, { steps: 8 });
      await page.mouse.up();

      await toolbar.getByRole("button", { name: "Select", exact: true }).click();
      const editor = page.locator(".excalidraw").first();
      await editor.click({ position: { x: 620, y: 420 } });
      await editor.press("Control+A");

      const actions = page.getByRole("toolbar", { name: "Selected shape actions" });
      await expect(actions).toBeVisible();
      await expect(actions.getByRole("button", { name: "Colors" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Common drawing properties" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Layer" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Align & distribute" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Duplicate" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Delete" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Arrow properties" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Font family" })).toBeVisible();
      await expect(actions.getByRole("button", { name: "Text properties" })).toBeVisible();

      await actions.getByRole("button", { name: "Common drawing properties" }).click();
      const drawingProperties = page.locator('[role="dialog"][aria-label="properties properties"]');
      await expect(drawingProperties.getByRole("region", { name: "Stroke width" })).toBeVisible();
      await expect(drawingProperties.getByRole("region", { name: "Opacity" })).toBeVisible();
      await expect(drawingProperties.getByRole("region", { name: "Fill · shapes" })).toBeVisible();
      await expect(drawingProperties.getByRole("region", { name: "Stroke pattern · lines" })).toBeVisible();
      await expect(drawingProperties.getByRole("region", { name: "Line feel · lines" })).toBeVisible();
      await expect(drawingProperties.getByRole("region", { name: "Corners · shapes" })).toBeVisible();
      await expect(drawingProperties.getByRole("region", { name: "Pressure · pen" })).toBeVisible();

      const actionBox = await actions.boundingBox();
      const toolBox = await toolbar.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(toolBox).not.toBeNull();
      expect(actionBox!.width).toBeLessThan(560);
      const stackGap = toolBox!.y - (actionBox!.y + actionBox!.height);
      expect(stackGap).toBeGreaterThanOrEqual(0);
      expect(stackGap).toBeLessThanOrEqual(16);

      await actions.getByRole("button", { name: "More selected shape actions" }).click();
      const morePanel = page.getByRole("dialog", { name: "more properties" });
      const moreBox = await morePanel.boundingBox();
      expect(moreBox).not.toBeNull();
      expect(moreBox!.width).toBeLessThanOrEqual(190);
      await expect(page.getByRole("region", { name: "Selection-specific" })).toHaveCount(0);
      await expect(morePanel.getByRole("button", { name: "Group selection" })).toBeVisible();
      await expect(morePanel.getByRole("button", { name: "Flip horizontal" })).toBeVisible();
      await expect(morePanel.getByRole("button", { name: "Add to library" })).toBeVisible();
    } finally {
      await cleanup(request, id);
    }
  });

  test("slash opens Diagram search and Escape closes it", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas diagram ${Date.now()}`);

    try {
      const canvas = page.locator(".notespace-canvas-surface");
      await canvas.click({ position: { x: 240, y: 180 } });
      await page.keyboard.press("/");

      const diagram = page.locator('aside[aria-label="Diagram tools"]');
      await expect(diagram).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Search diagram components" })).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(diagram).toBeHidden();
    } finally {
      await cleanup(request, id);
    }
  });
});
