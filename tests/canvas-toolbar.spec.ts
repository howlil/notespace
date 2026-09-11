import { expect, test } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";

async function openCanvasWorkspace(page: Page, request: APIRequestContext, title: string) {
  const response = await request.post("/api/projects", { data: { title } });
  expect(response.status()).toBe(201);
  const project = await response.json() as { id: string };

  await page.goto(`/workspaces/${project.id}`);
  await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
  await page.getByTestId("workspace-view-switcher").getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".excalidraw__canvas.interactive")).toBeVisible();

  return project.id;
}

function canvasToolbar(page: Page) {
  return page.getByRole("toolbar", { name: "Canvas tools" });
}

function menuTrigger(page: Page, label: string) {
  return page.locator('[data-canvas-menu-trigger="true"]').filter({ has: page.getByRole("button", { name: label, exact: true }) });
}

test.describe("Canvas toolbar native grouping", () => {
  test("keeps frequent tools in the rail and secondary tools in More", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar grouping ${Date.now()}`);

    try {
      const toolbar = canvasToolbar(page);
      for (const label of ["Select", "Hand", "Rectangle", "Diamond", "Ellipse", "Arrow", "Line", "Draw", "Text", "Image", "Eraser", "Colors", "Diagram", "Canvas details", "More tools"]) {
        await expect(toolbar.getByRole("button", { name: label, exact: true })).toBeVisible();
      }

      await expect(toolbar.getByRole("button", { name: "Lasso select", exact: true })).toHaveCount(0);
      await toolbar.getByRole("button", { name: "More tools", exact: true }).click();
      const more = page.locator('aside[aria-label="More canvas tools"]');
      await expect(more).toBeVisible();
      await expect(more.getByRole("button", { name: "Lasso select", exact: true })).toBeVisible();
      await expect(more.getByRole("button", { name: /^Frame/ })).toBeVisible();
      await expect(more.getByRole("button", { name: "Laser pointer", exact: true })).toBeVisible();
      await expect(more.getByRole("button", { name: "Bucket fill", exact: true })).toBeVisible();
      await expect(more.locator("section[aria-label='Selection']")).toBeVisible();
      await expect(more.locator("section[aria-label='Insert']")).toBeVisible();
      await expect(more.locator("section[aria-label='Review']")).toBeVisible();
      await expect(more.locator("section[aria-label='Utilities']")).toBeVisible();
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("slash opens Diagram with search focused and explicit controls switch popups", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar slash ${Date.now()}`);

    try {
      const canvas = page.locator(".notespace-canvas-surface");
      const diagramTrigger = menuTrigger(page, "Diagram");
      const detailsTrigger = menuTrigger(page, "Canvas details");
      const moreTrigger = menuTrigger(page, "More tools");
      const diagram = page.locator('aside[aria-label="Diagram tools"]');
      const details = page.locator('aside[aria-label="Canvas details"]');
      const more = page.locator('aside[aria-label="More canvas tools"]');

      await canvas.click({ position: { x: 240, y: 180 } });
      await page.keyboard.press("/");
      await expect(diagram).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Search all Eraser icons" })).toBeFocused();
      await expect(details).toBeHidden();
      await expect(more).toBeHidden();

      await diagramTrigger.getByRole("button", { name: "Diagram", exact: true }).click();
      await expect(diagram).toBeHidden();

      await detailsTrigger.hover();
      await expect(details).toHaveCount(0);
      await expect(diagram).toBeHidden();
      await expect(more).toBeHidden();

      await moreTrigger.hover();
      await expect(more).toBeVisible();
      await expect(diagram).toBeHidden();
      await expect(details).toBeHidden();
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("omits the details popup when no contextual controls are available", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar empty details ${Date.now()}`);

    try {
      const toolbar = canvasToolbar(page);
      const detailsTrigger = menuTrigger(page, "Canvas details");
      const details = page.locator('aside[aria-label="Canvas details"]');

      await detailsTrigger.hover();
      await expect(details).toHaveCount(0);

      await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
      await detailsTrigger.hover();
      await expect(details).toBeVisible();
      await expect(details.locator('section[aria-label="Fill"]')).toBeVisible();
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("details groups controls by the active native tool", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar details ${Date.now()}`);

    try {
      const toolbar = canvasToolbar(page);
      const detailsTrigger = menuTrigger(page, "Canvas details");
      const details = page.locator('aside[aria-label="Canvas details"]');

      const expectSections = async (visible: string[], hidden: string[]) => {
        await detailsTrigger.hover();
        await expect(details).toBeVisible();
        for (const label of visible) await expect(details.locator(`section[aria-label="${label}"]`)).toBeVisible();
        for (const label of hidden) await expect(details.locator(`section[aria-label="${label}"]`)).toHaveCount(0);
      };

      await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
      await expect(toolbar.getByRole("button", { name: "Rectangle", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expectSections(["Fill", "Stroke width", "Stroke style", "Sloppiness", "Edges", "Opacity"], ["Arrowheads", "Pressure", "Font size", "Text align"]);

      await toolbar.getByRole("button", { name: "Line", exact: true }).click();
      await expectSections(["Stroke width", "Stroke style", "Sloppiness", "Opacity"], ["Fill", "Edges", "Arrowheads", "Pressure", "Font size", "Text align"]);

      await toolbar.getByRole("button", { name: "Draw", exact: true }).click();
      await expectSections(["Fill", "Stroke width", "Pressure", "Opacity"], ["Stroke style", "Sloppiness", "Edges", "Arrowheads", "Font size", "Text align"]);

      await toolbar.getByRole("button", { name: "Text", exact: true }).click();
      await expectSections(["Font size", "Text align", "Opacity"], ["Fill", "Stroke width", "Stroke style", "Sloppiness", "Edges", "Arrowheads", "Pressure"]);
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("details style choices update the active tool state", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar styles ${Date.now()}`);

    try {
      const toolbar = canvasToolbar(page);
      const detailsTrigger = menuTrigger(page, "Canvas details");
      const details = page.locator('aside[aria-label="Canvas details"]');

      await toolbar.getByRole("button", { name: "Rectangle", exact: true }).click();
      await detailsTrigger.hover();
      await expect(details).toBeVisible();
      await details.locator('section[aria-label="Stroke width"]').getByRole("button", { name: "Medium", exact: true }).click();
      await expect(details.locator('section[aria-label="Stroke width"]').getByRole("button", { name: "Medium", exact: true })).toHaveAttribute("aria-pressed", "true");

      await toolbar.getByRole("button", { name: "Text", exact: true }).click();
      await detailsTrigger.hover();
      await details.locator('section[aria-label="Font size"]').getByRole("button", { name: "Font size L", exact: true }).click();
      await expect(details.locator('section[aria-label="Font size"]').getByRole("button", { name: "Font size L", exact: true })).toHaveAttribute("aria-pressed", "true");
      await details.getByRole("button", { name: "More text options", exact: true }).click();
      await expect(details.getByRole("combobox", { name: "Font family" })).toBeVisible();
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("text defaults from details are used by a newly created text element", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar text defaults ${Date.now()}`);

    try {
      const toolbar = canvasToolbar(page);
      const detailsTrigger = menuTrigger(page, "Canvas details");
      const details = page.locator('aside[aria-label="Canvas details"]');
      await toolbar.getByRole("button", { name: "Text", exact: true }).click();
      await detailsTrigger.hover();
      await details.locator('section[aria-label="Font size"]').getByRole("button", { name: "Font size L", exact: true }).click();

      const bounds = await page.locator(".excalidraw__canvas.interactive").boundingBox();
      if (!bounds) throw new Error("Canvas did not render");
      await page.mouse.click(bounds.x + 360, bounds.y + 240);
      await page.keyboard.type("Large text");
      await page.keyboard.press("Escape");
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();

      const stored = await (await request.get(`/api/projects/${id}`)).json() as { canvas: { data: { elements: Array<{ type: string; text?: string; fontSize?: number }> } } };
      const createdText = stored.canvas.data.elements.find((element) => element.type === "text" && element.text === "Large text");
      expect(createdText?.fontSize).toBe(28);
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });

  test("selected arrows expose arrowhead and arrow type controls", async ({ page, request }) => {
    const id = await openCanvasWorkspace(page, request, `Toolbar arrow styles ${Date.now()}`);

    try {
      const toolbar = canvasToolbar(page);
      const detailsTrigger = menuTrigger(page, "Canvas details");
      const details = page.locator('aside[aria-label="Canvas details"]');
      await toolbar.getByRole("button", { name: "Arrow", exact: true }).click();

      const bounds = await page.locator(".excalidraw__canvas.interactive").boundingBox();
      if (!bounds) throw new Error("Canvas did not render");
      const start = { x: bounds.x + 360, y: bounds.y + 240 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 180, start.y + 70, { steps: 8 });
      await page.mouse.up();
      await expect(toolbar.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.mouse.click(start.x + 90, start.y + 35);

      await detailsTrigger.hover();
      await expect(details).toBeVisible();
      await expect(details.locator('section[aria-label="Arrowheads"]')).toBeVisible();
      await expect(details.locator('section[aria-label="Arrow type"]')).toBeVisible();
      await details.locator('section[aria-label="Arrowheads"]').getByRole("button", { name: "end arrowhead", exact: true }).click();
      await expect(page.locator('[aria-label="end arrowhead options"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "end Triangle", exact: true })).toBeVisible();
    } finally {
      await request.delete(`/api/projects/${id}`);
    }
  });
});
