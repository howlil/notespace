import { test, expect, createViaAPI, cleanupWorkspace, selectView } from "./fixtures";

// Numeric measurements are the automated visual contract. Screenshots are
// review evidence (not golden-baseline comparisons); see DESIGN.md and M5 doc.
for (const viewport of [
  { width: 1440, height: 900, label: "wide" },
  { width: 768, height: 900, label: "tablet" },
  { width: 390, height: 844, label: "compact" },
]) {
  for (const view of ["Note", "Split"] as const) {
    test(`M5 ${viewport.label} ${view} geometry, tokens, menu ownership and screenshot evidence`, async ({ page, request }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const id = await createViaAPI(page, request, `M5 ${viewport.label} ${view} ${Date.now()}`);
      try {
        await selectView(page, view);
        const pane = page.locator('section[aria-label$="note pane"]').first();
        const header = pane.locator("header").first();
        const rail = page.getByRole("navigation", { name: "Workspace navigation" });
        const snapshot = await page.evaluate(() => {
          const nav = document.querySelector(".workspace-rail");
          const note = document.querySelector('section[aria-label$="note pane"]');
          const head = note?.querySelector("header");
          if (!(nav instanceof HTMLElement) || !(note instanceof HTMLElement) || !(head instanceof HTMLElement)) return null;
          const railBox = nav.getBoundingClientRect(), paneBox = note.getBoundingClientRect(), headBox = head.getBoundingClientRect();
          const css = getComputedStyle(document.documentElement);
          const style = getComputedStyle(head);
          return {
            railX: railBox.x, railY: railBox.y, railWidth: railBox.width,
            railHeight: railBox.height, noteX: paneBox.x,
            headHeight: headBox.height, headBorder: style.borderBottomWidth,
            headBackground: style.backgroundColor,
            headShadow: style.boxShadow,
            tokens: ["--bg", "--surface", "--ink", "--muted", "--line", "--accent", "--tint", "--canvas"]
              .map((token) => css.getPropertyValue(token).trim()),
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
          };
        });
        expect(snapshot).not.toBeNull();
        expect(snapshot!.railX).toBe(0);
        expect(snapshot!.railY).toBe(0);
        expect(snapshot!.railWidth).toBe(40);
        expect(snapshot!.railHeight).toBe(viewport.height);
        expect(snapshot!.noteX).toBeGreaterThanOrEqual(40);
        expect(snapshot!.headHeight).toBe(34);
        expect(snapshot!.headBorder).toBe("1px");
        expect(snapshot!.headShadow).toBe("none");
        expect(snapshot!.tokens.every(Boolean)).toBe(true);
        expect(snapshot!.scrollWidth).toBeLessThanOrEqual(snapshot!.viewportWidth + 1);
        await expect(rail.getByRole("group", { name: "Workspace view" }).getByRole("button")).toHaveCount(4);
        await expect(pane.getByRole("button", { name: "New note" })).toHaveCount(1);
        await expect(pane.getByRole("button", { name: "Navigate note" })).toHaveCount(1);
        await expect(pane.getByRole("button", { name: "Find in note" })).toHaveCount(0);
        await expect(pane.getByRole("button", { name: "Open note outline" })).toHaveCount(0);
        await expect(pane.getByRole("button", { name: "Code block", exact: true })).toHaveCount(0);
        if (view === "Split") {
          const canvasBounds = await page.evaluate(() => {
            const host = document.querySelector(".notespace-canvas-surface");
            const tools = host?.querySelector('[aria-label="Canvas tools"]');
            const controls = host?.querySelector('[aria-label="Canvas view controls"]');
            if (!(host instanceof HTMLElement) || !(tools instanceof HTMLElement) || !(controls instanceof HTMLElement)) return null;
            const h = host.getBoundingClientRect(), t = tools.getBoundingClientRect(), c = controls.getBoundingClientRect();
            return { left: h.left, right: h.right, toolLeft: t.left, toolRight: t.right, controlsLeft: c.left, controlsRight: c.right };
          });
          expect(canvasBounds).not.toBeNull();
          expect(canvasBounds!.toolLeft).toBeGreaterThanOrEqual(canvasBounds!.left - 1);
          expect(canvasBounds!.toolRight).toBeLessThanOrEqual(canvasBounds!.right + 1);
          expect(canvasBounds!.controlsLeft).toBeGreaterThanOrEqual(canvasBounds!.left - 1);
          expect(canvasBounds!.controlsRight).toBeLessThanOrEqual(canvasBounds!.right + 1);
        }
        await page.screenshot({ path: `test-results/m5-${viewport.label}-${view.toLowerCase()}.png`, animations: "disabled" });

        // All three controls share a 34px pane toolbar but have distinct owners.
        await pane.locator("details.pane-note-switcher > summary").click();
        const list = pane.getByRole("list", { name: "Notes in this workspace" });
        await expect(list).toBeVisible();
        await expect(list.getByRole("listitem")).toHaveCount(1);
        const deleteButton = list.getByRole("button", { name: /^Delete note/ });
        await expect(deleteButton).toHaveCSS("width", "28px");
        await expect(deleteButton).toBeDisabled(); // Keep the final Note.
        const pickerBox = await list.boundingBox();
        expect(pickerBox).not.toBeNull();
        expect(pickerBox!.x).toBeGreaterThanOrEqual(0);
        expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(viewport.width + 1);

        await pane.getByRole("button", { name: "Navigate note" }).click();
        await expect(pane.locator("details.pane-note-switcher")).not.toHaveAttribute("open", "");
        await expect(pane.getByRole("dialog", { name: "Navigate note" })).toBeVisible();
        await pane.getByRole("dialog", { name: "Navigate note" }).getByRole("button", { name: "Close navigate" }).click();
        await expect(pane.getByRole("dialog", { name: "Navigate note" })).toHaveCount(0);

        // Either header details menu must close its sibling (pointer and keyboard).
        const chooser = pane.locator("details.pane-note-switcher");
        const actions = pane.locator("details.pane-actions");
        await chooser.locator("summary").click();
        await actions.locator("summary").click();
        await expect(chooser).not.toHaveAttribute("open", "");
        await chooser.locator("summary").click();
        await expect(actions).not.toHaveAttribute("open", "");
        await chooser.locator("summary").click();

        // Save semantics must remain available to assistive technology.
        await expect(page.getByRole("status", { name: "Workspace save status" })).toHaveCount(1);
        await expect(header).toHaveCSS("height", "34px");
      } finally {
        await cleanupWorkspace(request, id);
      }
    });
  }
}

test("M5 keyboard navigation, Note picker semantics and reduced-motion interaction", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1024, height: 768 });
  const id = await createViaAPI(page, request, `M5 keyboard ${Date.now()}`);
  try {
    await selectView(page, "Note");
    const pane = page.locator('section[aria-label$="note pane"]').first();
    const chooser = pane.locator("details.pane-note-switcher > summary");
    await chooser.focus();
    await expect(chooser).toBeFocused();
    await chooser.press("Enter");
    const list = pane.getByRole("list", { name: "Notes in this workspace" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("button", { name: /^Open note/ })).toHaveAttribute("aria-current", "true");
    await expect(list.getByRole("button", { name: /^Delete note/ })).toBeDisabled();
    await chooser.press("Enter");
    await expect(list).not.toBeVisible();

    const navigate = pane.getByRole("button", { name: "Navigate note" });
    await navigate.focus();
    await navigate.press("Enter");
    const dialog = pane.getByRole("dialog", { name: "Navigate note" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("searchbox", { name: "Find" })).toBeFocused();
    await dialog.getByRole("searchbox", { name: "Find" }).fill("not-present");
    await expect(dialog.getByText("No matches")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(navigate).toBeFocused();

    const focus = page.getByRole("button", { name: "Focus mode" });
    await focus.focus();
    await focus.press("Enter");
    await expect(page.locator(".workspace-rail")).toHaveCount(0);
    const restore = page.getByRole("button", { name: "Restore layout" });
    await restore.focus();
    await restore.press("Enter");
    await expect(page.locator(".workspace-rail")).toBeVisible();

    await selectView(page, "Split");
    const separator = page.getByRole("separator", { name: /^Resize/ }).first();
    const before = Number(await separator.getAttribute("aria-valuenow"));
    await separator.focus();
    const arrow = await separator.getAttribute("aria-orientation") === "vertical" ? "ArrowRight" : "ArrowDown";
    await separator.press(arrow);
    await expect(separator).toHaveAttribute("aria-valuenow", String(Math.min(before + 5, 80)));
  } finally {
    await cleanupWorkspace(request, id);
  }
});
