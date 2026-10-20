import { expect, test, cleanupWorkspace, createViaAPI, selectView } from "./fixtures";

test("border-only Workspace chrome and keyboard splitter remain usable @critical", async ({ page, request }) => {
  const id = await createViaAPI(page, request, `Border-only ${Date.now()}`);
  try {
    const pageArea = page.locator(".workspace-main");
    await expect(page.getByRole("toolbar", { name: "Canvas tools" })).toBeVisible();
    await expect(page.locator('section[aria-label$="note pane"]').first()).toBeVisible();

    const bounds = await page.evaluate(() => {
      const parent = document.querySelector(".workspace-main");
      const content = document.querySelector(".workspace-main > div:last-child");
      const header = document.querySelector(".workspace-header");
      if (!(parent instanceof HTMLElement) || !(content instanceof HTMLElement) || !(header instanceof HTMLElement)) return null;
      const a = parent.getBoundingClientRect(), b = content.getBoundingClientRect(), h = header.getBoundingClientRect();
      return { left: b.left - a.left, right: a.right - b.right, top: b.top - h.bottom };
    });
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds!.top)).toBeLessThanOrEqual(1);

    const tools = page.getByRole("toolbar", { name: "Canvas tools" });
    await expect(tools).toHaveCSS("border-top-width", "1px");
    await expect(tools).toHaveClass(/shadow-none/);
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
    const separator = page.getByRole("separator", { name: /Resize vertical panes/ }).first();
    await expect(separator).toHaveAttribute("aria-orientation", "horizontal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await cleanupWorkspace(request, id);
  }
});
