/* Library recovery: Trash restore and full-library ZIP restore keep authored state. */
import { after, before, test } from "node:test";
import {
  api, apiResponse, assert, createWorkspace, deleteWorkspace, start, stop,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: workspace trash restores the same authored workspace", async () => {
  const title = `Trash recovery ${Date.now()}`;
  const workspace = await createWorkspace(title);
  try {
    const removed = await apiResponse(`/api/workspaces/${workspace.id}`, {
      method: "DELETE",
      headers: { "If-Match": `"${workspace.version}"` },
    });
    assert.equal(removed.status, 204);

    const trash = await api("/api/trash");
    assert.equal(trash.some((item) => item.id === workspace.id), true);

    const restored = await apiResponse(`/api/trash/${workspace.id}`, { method: "POST" });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).title, title);

    const read = await api(`/api/workspaces/${workspace.id}`);
    assert.equal(read.title, title);
  } finally {
    const active = await apiResponse(`/api/workspaces/${workspace.id}`);
    if (active.ok) await deleteWorkspace(workspace.id).catch(() => undefined);
    const trashed = await api("/api/trash");
    if (trashed.some((item) => item.id === workspace.id)) {
      await apiResponse(`/api/trash/${workspace.id}`, { method: "DELETE" });
    }
  }
});

test("critical: full-library ZIP backup restores an active workspace", async () => {
  const title = `Backup recovery ${Date.now()}`;
  const workspace = await createWorkspace(title);

  const backupResponse = await apiResponse("/api/backup");
  assert.equal(backupResponse.status, 200);
  assert.match(backupResponse.headers.get("content-type") ?? "", /application\/zip/);
  const backup = new Uint8Array(await backupResponse.arrayBuffer());

  try {
    await deleteWorkspace(workspace.id);
    assert.equal((await apiResponse(`/api/trash/${workspace.id}`, { method: "DELETE" })).status, 204);
    assert.equal((await apiResponse(`/api/workspaces/${workspace.id}`)).status, 404);

    const restore = await apiResponse("/api/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: backup,
    });
    assert.equal(restore.status, 204);

    const read = await api(`/api/workspaces/${workspace.id}`);
    assert.equal(read.title, title);
  } finally {
    const active = await apiResponse(`/api/workspaces/${workspace.id}`);
    if (active.ok) await deleteWorkspace(workspace.id).catch(() => undefined);
    const trashed = await api("/api/trash");
    if (trashed.some((item) => item.id === workspace.id)) {
      await apiResponse(`/api/trash/${workspace.id}`, { method: "DELETE" });
    }
  }
});
