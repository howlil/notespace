/* Global Card Library (/cards) and Far-Right Vertical Icon Rail + Docked Right Drawer (M3). */
import { after, before, test } from "node:test";
import {
  api, assert, cleanupWorkspace, click, createWorkspace, expectCount,
  fill, goto, role, start, stop, text, visible, waitUrl,
} from "../support/harness.mjs";

before(start);
after(stop);

test("Cards route filters, switches layout, opens Side Cards, and places linked Notes via Right Dock", async () => {
  const stamp = Date.now();
  const ws = await createWorkspace(`Cards Dock ${stamp}`);
  const noteId = `dock-note-${stamp}`;
  const instanceId = `dock-inst-${stamp}`;
  const elementId = `dock-el-${stamp}`;
  const noteTitle = `Dockable Card ${stamp}`;
  const noteBody = `# ${noteTitle}\n\nSpatial knowledge card body for M3 dock verification.`;

  try {
    // Create a canonical Note placed on ws via API.
    const created = await api(`/api/workspaces/${ws.id}/note-instances`, {
      method: "POST",
      body: {
        clientRequestId: `req-${stamp}`,
        clientNoteId: noteId,
        clientInstanceId: instanceId,
        elementId,
        expectedCanvasVersion: ws.canvasVersion,
        document: { type: "markdown", text: noteBody },
        canvas: {
          format: "excalidraw",
          version: 1,
          data: {
            elements: [
              {
                id: elementId,
                type: "rectangle",
                x: 80,
                y: 80,
                width: 320,
                height: 180,
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
                customData: { notespaceNote: { noteId, instanceId } },
              },
            ],
            appState: {},
            files: {},
          },
        },
        x: 80,
        y: 80,
        width: 320,
        height: 180,
      },
    });
    assert.equal(created.note.id, noteId);

    // 1. Open /cards via Left Explorer "Cards" link.
    await goto("/");
    await click(role("link", "Cards", { exact: true }));
    await waitUrl(/\/cards$/);
    await visible(role("heading", "Card Library", { exact: true }));
    await visible(text(noteTitle));

    // Filter Unplaced -> empty, then All -> visible.
    await click(role("button", "Unplaced", { exact: true }));
    await visible(text("No cards match your filters"));
    await click(role("button", "All", { exact: true }));
    await visible(text(noteTitle));

    // Switch Grid <-> List.
    await click(role("button", "List", { exact: true }));
    await visible(role("group", "Card Library list"));
    await click(role("button", "Grid", { exact: true }));
    await visible(role("group", "Card Library grid"));

    // Right Side Panel must NOT appear on /cards.
    await expectCount("[data-notespace-right-rail]", 0);

    // Click card -> opens dedicated full-page Card view (/cards/:noteId), NOT Side Panel.
    await click(text(noteTitle));
    await waitUrl(new RegExp(`/cards/${noteId}$`));
    await visible(role("heading", noteTitle, { exact: true }));
    await visible(role("button", "Note info and backlinks", { exact: true }));
    await expectCount("[data-notespace-right-drawer]", 0);
    await expectCount("[data-notespace-right-rail]", 0);

    // 2. Navigate to Workspace Canvas and open Right Side Panel via top-right trigger.
    await goto(`/workspaces/${ws.id}`);
    await expectCount("[data-notespace-right-rail]", 0);
    await click(role("button", "Toggle side panel", { exact: true }));
    await visible("[data-notespace-right-rail]");

    // Toggle Card Library (default mode), inspect card inline detail + back button.
    const libDrawer = "[data-notespace-right-drawer='library']";
    await visible(libDrawer);
    await fill(role("textbox", "Search Card Library"), noteTitle);
    const drawerCard = `${libDrawer} [data-note-card-id="${noteId}"]`;
    await visible(drawerCard);
    await click(drawerCard);
    await visible(role("button", "Card Library", { exact: false, scope: libDrawer }));
    await click(role("button", "Card Library", { exact: false, scope: libDrawer }));

    // Toggle Info & Backlinks (⌘3) and Outline (⌘4), then collapse via Close button.
    await click(role("button", "Info & Backlinks", { exact: true }));
    await visible("[data-notespace-right-drawer='info']");
    await click(role("button", "Outline", { exact: true }));
    await visible("[data-notespace-right-drawer='outline']");
    await click(role("button", "Close right drawer", { exact: true }));
    // Closing drawer leaves zero open drawer or rail strip.
    await expectCount("[data-notespace-right-drawer]", 0);
    await expectCount("[data-notespace-right-rail]", 0);
  } finally {
    await cleanupWorkspace(ws.id);
    await api(`/api/notes/${noteId}/trash`, { method: "POST" }).catch(() => undefined);
    await api(`/api/trash/notes/${noteId}`, { method: "DELETE" }).catch(() => undefined);
  }
});
