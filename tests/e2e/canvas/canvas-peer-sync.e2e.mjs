/* Same-browser Canvas peer sync: a shape authored in one tab reaches the other
 * tab through the peer channel and becomes durable once the Canvas transport
 * recovers. Both writes are blocked while the shape is authored, so durability
 * can only be explained by peer delivery plus a recovered save. */
import { after, before, test } from "node:test";
import {
  api, assert, box, clearFaults, click, createWorkspaceViaUI, deleteWorkspace,
  drag, expectCount, expectText, injectFault, newTab, notVisible, purgeTrash, role, start, stop, text, useTab,
  visible, waitFor, waitSaved,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: same-browser Canvas peer sync delivers and persists a shape", { timeout: 120_000 }, async () => {
  const workspaceId = await createWorkspaceViaUI(`Canvas peer ${Date.now()}`);
  const peer = await newTab(`/workspaces/${workspaceId}`);
  assert.notEqual(peer.page.windowHandle, peer.previous.windowHandle);
  try {
    // Both editors must be ready before faulting the shared Canvas transport.
    await useTab(peer.previous);
    await waitSaved();
    await useTab(peer.page);
    await visible(".excalidraw__canvas.interactive");
    await waitSaved();
    await visible(text("Start mapping", { exact: true }));
    await useTab(peer.previous);
    await visible(".excalidraw__canvas.interactive");

    await injectFault({
      method: "PATCH",
      path: new RegExp(`/api/workspaces/${workspaceId}/canvas$`),
      respond: async () => ({ abort: true }),
    });

    const toolbar = role("toolbar", "Canvas tools");
    const canvas = ".excalidraw__canvas.interactive";
    const bounds = await box(canvas);
    assert.ok(bounds.width > 0 && bounds.height > 0, "Canvas must render");
    await click(role("button", "Rectangle", { exact: true, scope: toolbar }));
    await drag(
      { x: bounds.x + 180, y: bounds.y + 160 },
      { x: bounds.x + 330, y: bounds.y + 250 },
    );

    // The peer tab must receive and render the shape while the authoring tab's
    // Canvas writes are failing at the transport boundary.
    await useTab(peer.page);
    await notVisible(text("Start mapping", { exact: true }));
    await expectCount(`${canvas}`, 1);
    const storedWhileBlocked = await api(`/api/workspaces/${workspaceId}`);
    const blocked = (storedWhileBlocked.canvas?.data?.elements ?? [])
      .filter((element) => !element.isDeleted && element.type === "rectangle").length;
    assert.equal(blocked, 0, "Canvas transport is blocked, so nothing may be durable yet");

    await useTab(peer.previous);
    await expectCount(canvas, 1);
    await expectText(role("status", "Workspace save status"), "Not saved");
    await useTab(peer.page);
    await expectText(role("status", "Workspace save status"), "Not saved");
    await clearFaults();
    // Retry only after both failed writes have settled and recovery is visible.
    for (const tab of [peer.previous, peer.page]) {
      await useTab(tab);
      await click(role("button", "Retry save"));
      await waitSaved();
    }
    await waitFor(async () => {
      const current = await api(`/api/workspaces/${workspaceId}`);
      return (current.canvas?.data?.elements ?? [])
        .filter((element) => !element.isDeleted && element.type === "rectangle").length === 1;
    }, "Peer-synced rectangle must reach SQLite after transport recovery", 30_000);
  } finally {
    await clearFaults();
    // after(stop) owns both browser tabs. Do not navigate an unsaved editor in
    // failure cleanup: its before-unload guard can block WebDriver teardown.
    await deleteWorkspace(workspaceId).catch(() => undefined);
    await purgeTrash(workspaceId);
  }
});
