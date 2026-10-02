import { test, expect, cleanupWorkspace, createViaAPI, frameCanvasSnapshot, frameClipboardPayload, selectView } from "./fixtures";
import { deferred } from "../helpers";

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
    await cleanupWorkspace(request, id);
  }
});

test("Note code blocks auto-detect JavaScript and run with ephemeral output", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Note code ${Date.now()}`);

  try {
    await selectView(page, "Note");
    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.fill("/code");

    const insertMenu = page.getByRole("listbox", { name: "Insert block" });
    await expect(insertMenu).toBeVisible();
    await insertMenu.getByRole("option", { name: /Code block/ }).click();

    const block = page.locator("[data-note-code-block]").first();
    await expect(block).toBeVisible();
    const source = block.getByLabel("Edit code block");
    const code = 'const answer = 40 + 2; console.log("note-ok"); return answer;';
    await source.fill(code);

    const language = block.getByRole("combobox", { name: "Code language" });
    await expect(language).toHaveValue("auto");
    await expect(language.locator("option:checked")).toHaveText("Auto · JavaScript");

    const theme = block.getByRole("button", { name: /Theme: Auto/ });
    await expect(theme).toBeVisible();
    await theme.click();
    await expect(block.getByRole("button", { name: "Theme: JetBrains Darcula" })).toBeVisible();
    await expect(block).toHaveCSS("background-color", "rgb(43, 43, 43)");
    const keyword = source.locator(".hljs-keyword").first();
    await expect(keyword).toBeVisible();
    await expect(keyword).toHaveCSS("color", "rgb(204, 120, 50)");

    await block.getByRole("button", { name: "Run JavaScript" }).click();
    const output = block.getByLabel("Code output", { exact: true });
    await expect(output).toContainText("note-ok");
    await expect(output).toContainText("42");
    await expect(output).toContainText(/Done/);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
      notes: Array<{ document: { data: { content?: Array<{ type?: string; attrs?: { theme?: string }; content?: Array<{ text?: string }> }> } } }>;
    };
    const codeNode = stored.notes[0]?.document.data.content?.find((node) => node.type === "codeBlock");
    expect(codeNode?.content?.map((item) => item.text ?? "").join("")).toBe(code);
    expect(codeNode?.attrs?.theme).toBe("dark");
    const storedDocument = JSON.stringify(stored.notes[0]?.document.data);
    expect(storedDocument).not.toContain('"stdout"');
    expect(storedDocument).not.toContain('"stderr"');
    expect(storedDocument).not.toContain('"durationMs"');
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("Note can embed Canvas frames by slash command or pasted Excalidraw frame and open the live frame", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Frame link ${Date.now()}`);

  try {
    const assetUpload = await request.put(`/api/workspaces/${id}/assets/asset-frame-logo`, {
      headers: { "Content-Type": "image/svg+xml" },
      data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#ef4444"/><rect x="8" y="8" width="16" height="16" fill="#ffffff"/></svg>'),
    });
    expect(assetUpload.status()).toBe(204);

    const current = await (await request.get(`/api/workspaces/${id}`)).json() as { canvasVersion: number };
    const canvasUpdate = await request.patch(`/api/workspaces/${id}/canvas`, {
      data: { canvas: frameCanvasSnapshot(), version: current.canvasVersion },
    });
    expect(canvasUpdate.status()).toBe(200);
    await page.reload();
    await selectView(page, "Note");

    const editor = page.getByRole("textbox", { name: "Workspace document" });
    await editor.fill("/link");
    const insertMenu = page.getByRole("listbox", { name: "Insert block" });
    await expect(insertMenu).toBeVisible();
    await insertMenu.getByRole("option", { name: /Link canvas/ }).click();

    const framePicker = page.getByRole("listbox", { name: "Canvas frames" });
    await expect(framePicker).toBeVisible();
    await framePicker.getByRole("option", { name: /Architecture/ }).click();

    const preview = page.getByRole("button", { name: "Open canvas frame Architecture" });
    await expect(preview).toHaveCount(1);
    await expect(page.getByRole("img", { name: "Preview of Architecture" })).toBeVisible();
    await expect(preview.getByText("2 objects", { exact: true })).toBeVisible();
    const previewImage = preview.locator('image[data-canvas-frame-preview-image="service-logo"]');
    await expect(previewImage).toHaveCount(1);
    await expect(previewImage).toHaveAttribute("href", /^blob:/);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await preview.click();
    await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Selected shape actions" })).toBeVisible();

    await selectView(page, "Note");
    const reloadedEditor = page.getByRole("textbox", { name: "Workspace document" });
    await reloadedEditor.click();

    let notePatchCount = 0;
    const firstPatchRelease = deferred<void>();
    await page.route(`**/api/workspaces/${id}/notes/*`, async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      notePatchCount += 1;
      if (notePatchCount === 1) await firstPatchRelease.promise;
      await route.continue();
    });

    await reloadedEditor.evaluate((node, payload) => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", payload);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: transfer });
      node.dispatchEvent(event);
    }, frameClipboardPayload());

    const linkedFrames = page.getByRole("button", { name: "Open canvas frame Architecture" });
    await expect(linkedFrames).toHaveCount(2);
    await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
    await expect.poll(() => notePatchCount).toBeGreaterThanOrEqual(1);

    await page.getByRole("button", { name: "Remove canvas frame link" }).first().click();
    await expect(linkedFrames).toHaveCount(1);
    firstPatchRelease.resolve();
    await expect.poll(() => notePatchCount).toBeGreaterThanOrEqual(2);
    await expect(linkedFrames).toHaveCount(1);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(notePatchCount).toBeGreaterThanOrEqual(2);
    await page.unroute(`**/api/workspaces/${id}/notes/*`);

    const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
      notes: Array<{ document: { data: { content?: Array<{ type?: string; attrs?: { frameId?: string } }> } } }>;
    };
    const frameNodes = stored.notes[0]?.document.data.content?.filter((node) => node.type === "canvasFrameLink") ?? [];
    expect(frameNodes).toHaveLength(1);
    expect(frameNodes[0]?.attrs?.frameId).toBe("frame-architecture");
  } finally {
    await cleanupWorkspace(request, id);
  }
});
