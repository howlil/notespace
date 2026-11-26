/* Library race: latest Card Library filter selection wins over a stale response. */
import { after, before, test } from "node:test";
import {
  cleanupWorkspace, click, createWorkspace, expectCount, goto,
  injectFault, role, start, stop, visible, waitFor, api,
} from "../support/harness.mjs";

before(start);
after(stop);

test("critical: latest Library scope selection wins over stale responses", async () => {
  const suffix = Date.now();
  const ws = await createWorkspace(`Race Board ${suffix}`);
  const placedId = `race-placed-${suffix}`;
  const unplacedId = `race-unplaced-${suffix}`;
  const placedTitle = `Placed Race Card ${suffix}`;
  const unplacedTitle = `Unplaced Race Card ${suffix}`;

  let held = false;
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });

  try {
    await api(`/api/workspaces/${ws.id}/note-instances`, {
      method: "POST",
      body: {
        clientRequestId: `req-p-${suffix}`,
        clientNoteId: placedId,
        clientInstanceId: `inst-p-${suffix}`,
        elementId: `el-p-${suffix}`,
        expectedCanvasVersion: ws.canvasVersion,
        document: { type: "markdown", text: `# ${placedTitle}` },
        canvas: {
          format: "excalidraw",
          version: 1,
          data: {
            elements: [
              {
                id: `el-p-${suffix}`,
                type: "rectangle",
                x: 60,
                y: 60,
                width: 300,
                height: 160,
                angle: 0,
                strokeColor: "#b8bec7",
                backgroundColor: "#ffffff",
                fillStyle: "solid",
                strokeWidth: 1,
                strokeStyle: "solid",
                roughness: 0,
                opacity: 0,
                groupIds: [],
                frameId: null,
                index: "a0",
                roundness: { type: 3 },
                seed: 1,
                version: 1,
                versionNonce: 1,
                isDeleted: false,
                boundElements: null,
                updated: 1,
                link: null,
                locked: false,
                customData: { notespaceNote: { noteId: placedId, instanceId: `inst-p-${suffix}` } },
              },
            ],
            appState: {},
            files: {},
          },
        },
        x: 60,
        y: 60,
        width: 300,
        height: 160,
      },
    });
    const tempWs = await createWorkspace(`Temp Race ${suffix}`);
    await api(`/api/workspaces/${tempWs.id}/note-instances`, {
      method: "POST",
      body: {
        clientRequestId: `req-u-${suffix}`,
        clientNoteId: unplacedId,
        clientInstanceId: `inst-u-${suffix}`,
        elementId: `el-u-${suffix}`,
        expectedCanvasVersion: tempWs.canvasVersion,
        document: { type: "markdown", text: `# ${unplacedTitle}` },
        canvas: {
          format: "excalidraw",
          version: 1,
          data: {
            elements: [
              {
                id: `el-u-${suffix}`,
                type: "rectangle",
                x: 60,
                y: 60,
                width: 300,
                height: 160,
                angle: 0,
                strokeColor: "#b8bec7",
                backgroundColor: "#ffffff",
                fillStyle: "solid",
                strokeWidth: 1,
                strokeStyle: "solid",
                roughness: 0,
                opacity: 0,
                groupIds: [],
                frameId: null,
                index: "a0",
                roundness: { type: 3 },
                seed: 1,
                version: 1,
                versionNonce: 1,
                isDeleted: false,
                boundElements: null,
                updated: 1,
                link: null,
                locked: false,
                customData: { notespaceNote: { noteId: unplacedId, instanceId: `inst-u-${suffix}` } },
              },
            ],
            appState: {},
            files: {},
          },
        },
        x: 60,
        y: 60,
        width: 300,
        height: 160,
      },
    });
    await cleanupWorkspace(tempWs.id);

    await goto("/cards");
    await visible(`[data-note-card-id="${placedId}"]`);

    await injectFault({
      method: "GET",
      path: /\/api\/notes\?.*placed=unplaced/,
      times: 1,
      respond: async () => {
        held = true;
        await gate;
        return null;
      },
    });

    await click(role("button", "Unplaced", { exact: true }));
    await waitFor(() => held, "Unplaced request must reach transport boundary");

    await click(role("button", "Placed", { exact: true }));
    await visible(`[data-note-card-id="${placedId}"]`);

    release();
    await visible(`[data-note-card-id="${placedId}"]`);
    await expectCount(`[data-note-card-id="${unplacedId}"]`, 0);
  } finally {
    release();
    await cleanupWorkspace(ws.id);
    await api(`/api/notes/${placedId}/trash`, { method: "POST" }).catch(() => undefined);
    await api(`/api/trash/notes/${placedId}`, { method: "DELETE" }).catch(() => undefined);
    await api(`/api/notes/${unplacedId}/trash`, { method: "POST" }).catch(() => undefined);
    await api(`/api/trash/notes/${unplacedId}`, { method: "DELETE" }).catch(() => undefined);
  }
});
