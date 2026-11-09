/* Workspace shell: one Canvas surface, no retired view navigation, no overflow. */
import { after, before, test } from "node:test";
import {
  assert, box, cleanupWorkspace, click, createWorkspace, doubleClick, evaluate, expectAttribute, expectCount, fill,
  openWorkspace, resetViewport, role, setViewport, start, stop, visible, waitFor, waitSaved, within,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Workspace uses one Canvas shell and has no retired view navigation", async () => {
  const workspace = await createWorkspace(`Canvas shell ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const canvas = ".excalidraw__canvas.interactive";
    const geometry = await box(canvas);
    assert.ok(geometry.width > 400, `Canvas width: ${geometry.width}`);
    assert.ok(geometry.height > 250, `Canvas height: ${geometry.height}`);
    await visible(role("toolbar", "Canvas tools"));
    await expectCount(role("navigation", "Workspace navigation"), 0);
    await expectCount('[data-testid="workspace-view-switcher"]', 0);
    await expectCount(role("button", "Focus mode"), 0);

    await evaluate(canvas, (element) => element.setAttribute("data-shell-instance", "preserved"));
    await click(role("button", "Code block", { exact: true, scope: role("toolbar", "Canvas tools") }));
    await click(role("button", "Zoom in", { exact: true, scope: role("toolbar", "Canvas view controls") }));
    const block = "[data-canvas-code-block]";
    await doubleClick(block);
    await fill(await within(block, '[aria-label="Edit code block"]'), 'const shellDraft = "retained";');
    await waitSaved();
    const codeBounds = await box(block);
    // The separate toggle changes layout without replacing the Canvas session.
    await visible(role("complementary", "Category explorer"));
    await click(role("button", "Hide Explorer", { exact: true }));
    await expectCount(role("complementary", "Category explorer"), 0);
    await waitFor(async () => (await box(canvas)).width > geometry.width + 220, "Dock collapse releases the full Canvas width");
    await expectAttribute(canvas, "data-shell-instance", "preserved");
    await visible(role("toolbar", "Code block settings"));
    assert.ok((await evaluate(block, (element) => element.textContent)).includes('shellDraft = "retained"'));
    assert.ok(Math.abs((await box(block)).width - codeBounds.width) < 1, "Collapse preserves Canvas zoom");
    await click(role("button", "Show Explorer", { exact: true }));
    await visible(role("complementary", "Category explorer"));
    await expectAttribute(canvas, "data-shell-instance", "preserved");
    assert.ok(Math.abs((await box(block)).width - codeBounds.width) < 1, "Expand preserves zoom and selection");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: narrow Canvas shell has no horizontal page overflow", async () => {
  await setViewport(390, 844);
  const workspace = await createWorkspace(`Canvas narrow ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const surface = await box(".excalidraw__canvas.interactive");
    await expectCount(role("complementary", "Category explorer"), 0);
    assert.ok(surface.width > 350, `Canvas width on compact: ${surface.width}`);
    assert.ok(surface.height > 400, `Canvas height on compact: ${surface.height}`);
    assert.equal(await evaluate("html", (element) => element.scrollWidth <= innerWidth), true);
  } finally {
    await cleanupWorkspace(workspace.id);
    await resetViewport();
  }
});
