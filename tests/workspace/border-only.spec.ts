import { expect, test, cleanupWorkspace, createViaAPI, selectView } from "./fixtures";

test("border-only Workspace chrome and keyboard splitter remain usable @critical", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Border-only ${Date.now()}`);
  try {
    const pageArea = page.locator(".workspace-main");
    await expect(page.getByRole("toolbar", { name: "Canvas tools" })).toBeVisible();
    await expect(page.locator('section[aria-label$="note pane"]').first()).toBeVisible();

    const bounds = await page.evaluate(() => {
      const parent = document.querySelector(".workspace-main");
      const rail = document.querySelector(".workspace-rail");
      const content = document.querySelector(".workspace-main > div.relative");
      if (!(parent instanceof HTMLElement) || !(content instanceof HTMLElement) || !(rail instanceof HTMLElement)) return null;
      const a = parent.getBoundingClientRect(), b = content.getBoundingClientRect(), r = rail.getBoundingClientRect();
      const switcher = rail.querySelector('[data-testid="workspace-view-switcher"]');
      const v = switcher?.getBoundingClientRect();
      return { gap: b.left - r.right, right: a.right - b.right, top: b.top - a.top, railWidth: r.width, railHeight: r.height, centerDelta: v ? (v.top + v.height / 2) - (r.top + r.height / 2) : null };
    });
    expect(bounds).not.toBeNull();
    expect(bounds!.railWidth).toBe(40);
    expect(bounds!.railHeight).toBeGreaterThan(300);
    expect(Math.abs(bounds!.gap)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.top)).toBeLessThanOrEqual(1);
    expect(bounds!.centerDelta).not.toBeNull();
    expect(Math.abs(bounds!.centerDelta!)).toBeLessThanOrEqual(1);

    const tools = page.getByRole("toolbar", { name: "Canvas tools" });
    await expect(tools).toHaveCSS("border-top-width", "1px");
    await expect(tools).toHaveClass(/rounded-lg/);
    await expect(tools).toHaveClass(/shadow-none/);
    const floatingGaps = await page.evaluate(() => {
      const canvas = document.querySelector(".notespace-canvas-surface");
      const toolRail = document.querySelector('[aria-label="Canvas tools"]');
      const viewControls = document.querySelector('[aria-label="Canvas view controls"]');
      if (!(canvas instanceof HTMLElement) || !(toolRail instanceof HTMLElement) || !(viewControls instanceof HTMLElement)) return null;
      const surface = canvas.getBoundingClientRect();
      const bottom = toolRail.getBoundingClientRect();
      const top = viewControls.getBoundingClientRect();
      return { bottom: surface.bottom - bottom.bottom, top: top.top - surface.top, right: surface.right - top.right, railWidth: bottom.width, canvasWidth: surface.width };
    });
    expect(floatingGaps).not.toBeNull();
    expect(floatingGaps!.bottom).toBeGreaterThanOrEqual(6);
    expect(floatingGaps!.top).toBeGreaterThanOrEqual(6);
    expect(floatingGaps!.right).toBeGreaterThanOrEqual(6);
    expect(floatingGaps!.railWidth).toBeLessThan(floatingGaps!.canvasWidth);
    const visibleShadow = await tools.evaluate((element) => {
      const computed = getComputedStyle(element).boxShadow;
      if (computed === "none") return false;
      return computed.split(/,(?![^()]*\))/).some((layer) => !/rgba\([^)]*,\s*0(?:\.0+)?\)/.test(layer));
    });
    expect(visibleShadow).toBe(false);

    const splitter = page.getByRole("separator", { name: /Resize horizontal panes/ }).first();
    await expect(splitter).toHaveAttribute("aria-orientation", "vertical");
    const initial = Number(await splitter.getAttribute("aria-valuenow"));
    await splitter.focus();
    await splitter.press("ArrowRight");
    await expect(splitter).toHaveAttribute("aria-valuenow", String(Math.min(80, initial + 5)));

    await selectView(page, "Note");
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    await selectView(page, "Canvas");
    await expect(page.getByRole("toolbar", { name: "Canvas tools" })).toBeVisible();
    await pageArea.getByTestId("workspace-view-switcher").getByRole("button", { name: "Plan" }).click();
    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  } finally {
    await cleanupWorkspace(request, id);
  }
});

test("border-only Workspace keeps narrow Split accessible @critical", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await createViaAPI(page, request, `Border-only mobile ${Date.now()}`);
  try {
    await selectView(page, "Split");
    await expect(page.getByRole("textbox", { name: "Workspace document" })).toBeVisible();
    const tools = page.getByRole("toolbar", { name: "Canvas tools" });
    await expect(tools).toBeVisible();
    await expect(tools).toHaveCSS("border-top-width", "1px");
    await expect(tools).toHaveClass(/rounded-lg/);
    const separator = page.getByRole("separator", { name: /Resize vertical panes/ }).first();
    await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
