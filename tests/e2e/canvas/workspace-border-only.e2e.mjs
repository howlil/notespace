/* Canvas chrome stays border-only and usable inside the shared shell. */
import { after, before, test } from "node:test";
import {
  assert, box, cleanupWorkspace, css, createWorkspace, expectClass, expectCount,
  openWorkspace, role, start, stop, visible,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Canvas controls remain border-only and usable with the shared shell", async () => {
  const workspace = await createWorkspace(`Canvas chrome ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const tools = role("toolbar", "Canvas tools");
    await visible(tools);
    assert.equal((await css(tools, "border-top-width")).value, "1px");
    await expectClass(tools, /shadow-none/);

    const surface = await box(".notespace-canvas-surface");
    const canvas = await box(".excalidraw__canvas.interactive");
    assert.ok(surface.height > 250, `Canvas surface height: ${surface.height}`);
    assert.ok(canvas.height > 250, `Canvas height: ${canvas.height}`);
    await visible(role("toolbar", "Canvas view controls"));
    await expectCount(role("separator", /Resize horizontal panes|Resize vertical panes/), 0);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
