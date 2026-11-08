/* Canvas pinch zoom applies to both the drawing surface and HTML overlays. */
import { after, before, test } from "node:test";
import {
  assert, box, cleanupWorkspace, click, createWorkspace, evaluate, openWorkspace,
  role, start, stop, visible, waitFor,
} from "../support/harness.mjs";
before(start);
after(stop);

test("trackpad-style pinch zooms only the Canvas; plain wheel keeps the zoom unchanged", async () => {
  const workspace = await createWorkspace(`Canvas pinch ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const canvas = ".excalidraw__canvas.interactive";
    const view = role("toolbar", "Canvas view controls");
    const reset = role("button", "Reset zoom", { exact: true, scope: view });
    await click(reset);
    await click(role("button", "Code block", { exact: true, scope: role("toolbar", "Canvas tools") }));
    const overlay = "[data-canvas-code-block]";
    await visible(overlay);
    const initialWidth = (await box(overlay)).width;
    const zoomIs = (ratio) => waitFor(async () => Math.abs((await box(overlay)).width / initialWidth - ratio) < 0.01,
      `Canvas renders the code block at ${Math.round(ratio * 100)}%`);
    const wheel = (target, deltaY, ctrlKey) => evaluate(target, (element, args) => {
      const rect = element.getBoundingClientRect();
      return element.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true,
        ctrlKey: args.ctrlKey, deltaY: args.deltaY, deltaMode: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    }, { deltaY, ctrlKey });
    assert.equal(await wheel(canvas, -8, true), false);
    await zoomIs(1.08);
    await wheel(canvas, 40, false);
    await zoomIs(1.08);
    assert.equal(await wheel(canvas, 8, true), false);
    await zoomIs(1);
    assert.equal(await wheel(overlay, -8, true), false);
    await zoomIs(1.08);
    await click(reset);
    await zoomIs(1);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
