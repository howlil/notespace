/* Canvas pinch zoom applies to both the drawing surface and HTML overlays. */
import { after, before, test } from "node:test";
import {
  assert, box, cleanupWorkspace, click, createWorkspace, doubleClick, evaluate, openWorkspace,
  press, role, start, stop, visible, waitFor, within,
} from "../support/harness.mjs";
before(start);
after(stop);

test("trackpad-style pinch zooms only the Canvas; plain wheel keeps the zoom unchanged", async () => {
  const workspace = await createWorkspace(`Canvas pinch ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const canvas = ".excalidraw__canvas.interactive";
    const view = role("toolbar", "Canvas view controls");
    const resetZoom = async () => {
      await click(role("button", "More canvas actions", { scope: view }));
      await click(role("button", "Reset zoom", { exact: true, scope: role("dialog", "Canvas options") }));
    };
    await resetZoom();
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
    await resetZoom();
    await zoomIs(1);

    // Consecutive touchpad events arriving inside one frame must accumulate.
    const burst = await evaluate(canvas, (element) => {
      const rect = element.getBoundingClientRect();
      const init = {
        bubbles: true, cancelable: true, ctrlKey: true, deltaY: -4, deltaMode: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      };
      return [
        element.dispatchEvent(new WheelEvent("wheel", init)),
        element.dispatchEvent(new WheelEvent("wheel", init)),
      ];
    });
    assert.deepEqual(burst, [false, false]);
    await zoomIs(1.08);
    await resetZoom();
    await zoomIs(1);

    // Pinching while editing a code block still zooms the Canvas.
    await doubleClick(overlay);
    const editor = await within(overlay, '[aria-label="Edit code block"]');
    await visible(editor);
    assert.equal(await wheel(editor, -8, true), false);
    await zoomIs(1.08);
    await press("Escape");
    await resetZoom();
    await zoomIs(1);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
