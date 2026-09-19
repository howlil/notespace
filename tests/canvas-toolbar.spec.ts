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
      for (const label of ["Lasso select", "Frame", "Laser pointer", "Bucket fill"]) {
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

  test("code block edits, runs JavaScript locally, persists source, and keeps output ephemeral", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Canvas code ${Date.now()}`);

    try {
      const toolbar = page.getByRole("toolbar", { name: "Canvas tools" });
      await toolbar.getByRole("button", { name: "Code block", exact: true }).click();

      const block = page.locator("[data-canvas-code-block]").first();
      await expect(block).toBeVisible();
      await expect(block.getByRole("button", { name: "Run JavaScript" })).toBeVisible();

      await block.getByRole("button", { name: "Edit code" }).click();
      const editor = block.getByRole("textbox", { name: "Edit code block" });
      await editor.fill('console.log("worker-ok");\nreturn 42;');
      await expect(editor).toHaveValue('console.log("worker-ok");\nreturn 42;');
      await editor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");

      const output = block.getByLabel("Code output");
      await expect(output).toContainText("worker-ok");
      await expect(output).toContainText("42");
      await expect(output).toContainText(/Done/);

      await expect.poll(async () => {
        const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
          canvas: { data: { elements: Array<{ customData?: Record<string, unknown>; isDeleted?: boolean }> } };
        };
        const element = stored.canvas.data.elements.find((candidate) => {
          const customData = candidate.customData as { notespaceCodeBlock?: { code?: string } } | undefined;
          return !candidate.isDeleted && customData?.notespaceCodeBlock?.code?.includes("worker-ok");
        });
        return element?.customData;
      }).toMatchObject({
        notespaceCodeBlock: {
          code: 'console.log("worker-ok");\nreturn 42;',
          language: "javascript",
        },
      });

      const stored = await (await request.get(`/api/workspaces/${id}`)).json() as {
        canvas: { data: unknown };
      };
      expect(JSON.stringify(stored.canvas.data)).not.toContain("worker-ok\",\"status");
      expect(JSON.stringify(stored.canvas.data)).not.toContain("\"stdout\"");

      await page.reload();
      await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
      const reloaded = page.locator("[data-canvas-code-block]").first();
      await expect(reloaded).toBeVisible();
      await expect(reloaded.getByLabel("Highlighted code")).toContainText("worker-ok");
      await expect(reloaded.getByLabel("Code output")).toHaveCount(0);
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
