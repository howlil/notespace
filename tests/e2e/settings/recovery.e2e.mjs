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
  const noteId = `backup-note-${Date.now()}`;
  const instanceId = `backup-instance-${Date.now()}`;
  const elementId = `backup-element-${Date.now()}`;
  const noteText = `Canvas Note backup ${Date.now()}`;
  const canvas = {
    format: "excalidraw",
    version: 1,
    data: {
      elements: [{
        id: elementId,
        isDeleted: false,
        customData: { notespaceNote: { noteId, instanceId } },
      }],
      appState: {},
      files: {},
    },
  };
  const noteCreated = await apiResponse(`/api/workspaces/${workspace.id}/note-instances`, {
    method: "POST",
    body: {
      clientRequestId: `req-${noteId}`,
      clientNoteId: noteId,
      clientInstanceId: instanceId,
      elementId,
      expectedCanvasVersion: workspace.canvasVersion ?? 0,
      document: {
        type: "doc",
        content: [{ type: "paragraph", attrs: { blockId: "block-backup-1" }, content: [{ type: "text", text: noteText }] }],
      },
      canvas,
      x: 40,
      y: 64,
      width: 320,
      height: 180,
    },
  });
  assert.equal(noteCreated.status, 200);

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
    const liveRefs = (read.canvas?.data?.elements ?? [])
      .filter((element) => !element.isDeleted && element.customData?.notespaceNote)
      .map((element) => element.customData.notespaceNote);
    assert.deepEqual(liveRefs, [{ noteId, instanceId }]);
    const restoredNote = await api(`/api/notes/${noteId}`);
    assert.match(JSON.stringify(restoredNote.document), new RegExp(noteText));
  } finally {
    const active = await apiResponse(`/api/workspaces/${workspace.id}`);
    if (active.ok) await deleteWorkspace(workspace.id).catch(() => undefined);
    const trashed = await api("/api/trash");
    if (trashed.some((item) => item.id === workspace.id)) {
      await apiResponse(`/api/trash/${workspace.id}`, { method: "DELETE" });
    }
  }
});
