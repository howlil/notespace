/* Critical cross-system browser journeys.
 *
 * These journeys prove the paths an operator cannot recover from silently:
 * first-run Canvas creation, legacy deep-link compatibility, and Quick Open.
 */
import { after, before, test } from "node:test";
import { api, assert, box, click, createWorkspace, createWorkspaceViaUI, deleteWorkspace, expectCount, goto, purgeTrash, role, start, stop, visible } from "../support/harness.mjs";

before(start);
after(stop);

test("critical: Welcome creates a Workspace and opens a drawable Canvas", { timeout: 60_000 }, async () => {
  const id = await createWorkspaceViaUI("Critical welcome Workspace");
  try {
    const canvas = await box(".excalidraw__canvas.interactive");
    assert.ok(canvas.width > 350 && canvas.height > 250, `Canvas must be drawable: ${JSON.stringify(canvas)}`);
    assert.equal((await api(`/api/workspaces/${id}`)).id, id);
  } finally {
    await deleteWorkspace(id).catch(() => undefined);
    await purgeTrash(id);
  }
});

test("critical: shared shell retains Explorer and Quick Open", { timeout: 45_000 }, async () => {
  await goto("/");
  await visible(role("complementary", "Category explorer"));
  await visible(role("button", /Search Notespace/));
  await click(role("button", /Search Notespace/));
  await visible(role("dialog", "Quick Open"));
});

test("critical: legacy Note links open only their Workspace Canvas", async () => {
  const workspace = await createWorkspace("Legacy link compatibility");
  try {
    await goto(`/workspaces/${workspace.id}?note=retired-note&block=retired-block`);
    await visible(".excalidraw__canvas.interactive");
    await expectCount(role("dialog", "Note editor"), 0);
    await expectCount(role("button", "New Note", { exact: true }), 0);
    await expectCount(role("button", "Link note", { exact: true }), 0);
    const stored = await api(`/api/workspaces/${workspace.id}`);
    assert.deepEqual(stored.notes, []);
    assert.deepEqual(stored.references, []);
  } finally {
    await deleteWorkspace(workspace.id).catch(() => undefined);
    await purgeTrash(workspace.id);
  }
});
