/* Canvas persistence and the navigation save barrier. */
import { after, before, test } from "node:test";
import {
  api, assert, box, cleanupWorkspace, clearFault, click, createWorkspaceViaUI,
  currentUrl, drag, injectFault, openWorkspace, reload, role, start, stop,
  visible, waitFor, waitSaved, waitUrl,
} from "../support/harness.mjs";
before(start);
after(stop);

test("critical: Canvas edits flush before leaving and survive reopening and reload", async () => {
  const id = await createWorkspaceViaUI(`Canvas persistence ${Date.now()}`);
  let release;
  let fault;
  try {
    fault = await injectFault({ method: "PATCH", path: `/api/workspaces/${id}/canvas`, times: 1,
      respond: () => new Promise((resolve) => { release = () => resolve(null); }),
    });
    const bounds = await box(".excalidraw__canvas.interactive");
    await click(role("button", "Rectangle", { exact: true, scope: role("toolbar", "Canvas tools") }));
    await drag({ x: bounds.x + 220, y: bounds.y + 180 }, { x: bounds.x + 360, y: bounds.y + 250 });
    await waitFor(() => Boolean(release), "Canvas write reaches the save barrier");
    await click(role("link", "All workspaces", { exact: true }));
    assert.equal((await currentUrl()).pathname, `/workspaces/${id}`, "Navigation waits for the outstanding save");
    release();
    await waitUrl(/\/$/);
    await openWorkspace(id);
    await waitSaved();
    const saved = await api(`/api/workspaces/${id}/canvas`);
    assert.equal(saved.canvas.data.elements.filter((e) => !e.isDeleted && e.type === "rectangle").length, 1);
    await reload();
    await visible(".excalidraw__canvas.interactive");
    assert.deepEqual((await api(`/api/workspaces/${id}/canvas`)).canvas, saved.canvas);
  } finally {
    release?.();
    if (fault) await clearFault(fault);
    await cleanupWorkspace(id);
  }
});
