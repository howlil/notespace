/* Canvas-native Note duplication, cross-workspace links, embeds, connectors, and modal/extract flows. */
import { after, before, test } from "node:test";
import {
  api, ariaLabel, assert, cleanupWorkspace, click, clickAt, count, createWorkspace, doubleClick, drag, execute,
  containsText, expectFocused, expectCount, fill, movePointer, openWorkspace, placeholder, press, role, sleep, start, stop, visible,
  typeText, waitFor, waitUrl,
} from "../support/harness.mjs";
import { canvasNoteIds, canvasNoteRefs, createNoteOnCanvas, visualBox, waitSaved } from "./note-helpers.mjs";

before(start);
after(stop);

test("critical: duplicating a Note creates a new Note with the same content", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const sourceId = await createNoteOnCanvas(workspace.id);
    const text = "duplicate source keeps its text";
    await fill("[data-note-element] .ProseMirror", text);
    await waitSaved();
    await press("Escape");
    await expectCount("[data-note-element] .ProseMirror", 0);
    await press("Enter");
    await visible("[data-note-element] .ProseMirror");
    await expectCount(role("toolbar", "Canvas Note actions"), 0);
    await press("Escape");
    await expectCount("[data-note-element] .ProseMirror", 0);
    await click(role("button", "More", { scope: role("toolbar", "Canvas Note actions") }));
    await click(role("button", "Duplicate"));
    await waitFor(async () => (await canvasNoteIds(workspace.id)).length === 2, "Duplicate adds a second Canvas instance");
    const ids = await canvasNoteIds(workspace.id);
    assert.ok(ids.includes(sourceId), "The source Note keeps its identity");
    const copyId = ids.find((id) => id !== sourceId);
    assert.ok(copyId, "The duplicate references a different Note");
    await waitFor(async () => JSON.stringify((await api(`/api/notes/${copyId}`)).document).includes(text), "The new Note carries the copied content");
    const source = await api(`/api/notes/${sourceId}`);
    assert.match(JSON.stringify(source.document), new RegExp(text), "Editing the copy later must not change the source; the source still has its text");

    await click(role("button", "More", { scope: role("toolbar", "Canvas Note actions") }));
    await click(role("button", "Remove instance"));
    await waitFor(async () => (await canvasNoteIds(workspace.id)).length === 1, "Remove instance removes the selected card from Canvas");
    await containsText('[aria-label="Notifications"]', "Note removed from Canvas. The Note itself remains.");
    await click(role("button", "Undo", { scope: role("region", "Notifications") }));
    await waitFor(async () => (await canvasNoteIds(workspace.id)).length === 2, "Undo restores the removed Note instance");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: native Ctrl+D copy of a Note card gets its own Note and never shares an instance", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const sourceId = await createNoteOnCanvas(workspace.id);
    const text = "native copy keeps the same text";
    await fill("[data-note-element] .ProseMirror", text);
    await waitSaved();
    await press("Escape");
    await expectCount("[data-note-element] .ProseMirror", 0);
    const point = await execute(() => {
      const rect = document.querySelector("[data-note-element]").getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await drag(point, point);
    await press("Control+d");
    await waitFor(async () => (await canvasNoteRefs(workspace.id)).length === 2, "Native duplicate adds a second live instance");
    await waitSaved();
    const refs = await canvasNoteRefs(workspace.id);
    assert.equal(new Set(refs.map((ref) => ref.instanceId)).size, 2, "Copies never share an instance identity");
    assert.equal(new Set(refs.map((ref) => ref.noteId)).size, 2, "The copy gets its own Note, not the source's");
    assert.ok(refs.some((ref) => ref.noteId === sourceId), "The original keeps its Note");
    const copy = refs.find((ref) => ref.noteId !== sourceId);
    await waitFor(async () => JSON.stringify((await api(`/api/notes/${copy.noteId}`)).document).includes(text), "The copy carries the source content");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("cross-workspace linked Note instances share canonical content and keep instance removal isolated", { timeout: 180_000 }, async () => {
  const token = `Linked${Date.now()}`;
  const workspaceA = await createWorkspace(`Note Link A ${token}`);
  const workspaceB = await createWorkspace(`Note Link B ${token}`);
  try {
    await openWorkspace(workspaceA.id);
    const noteId = await createNoteOnCanvas(workspaceA.id);
    const editor = "[data-note-element] .ProseMirror";
    const initialHeadline = `${token} alpha headline`;
    await fill(editor, initialHeadline);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspaceB.id);
    await expectCount("[data-note-element]", 0);
    await click(role("button", "Search Notespace", { exact: true }));
    await fill(placeholder("Open workspace or category…"), initialHeadline);
    const dialog = role("dialog", "Quick Open");
    await visible(role("button", new RegExp(initialHeadline), { scope: dialog }));
    await click(role("button", "Place", { scope: dialog, exact: true }));
    await visible("[data-note-element]");
    await containsText("[data-note-element]", initialHeadline);
    await waitFor(async () => (await canvasNoteIds(workspaceB.id)).includes(noteId), "Workspace B persists the linked Note instance");

    await openWorkspace(workspaceA.id);
    await doubleClick("[data-note-element]");
    await visible(editor);
    const updatedHeadline = `${token} synced revision`;
    await fill(editor, updatedHeadline);
    await waitSaved();

    await openWorkspace(workspaceB.id);
    await containsText("[data-note-element]", updatedHeadline);

    await doubleClick("[data-note-element]");
    await visible(editor);
    await press("Escape");
    await expectCount(editor, 0);
    await click(role("button", "More", { scope: role("toolbar", "Canvas Note actions") }));
    await click(role("button", "Remove instance"));
    await waitFor(async () => (await canvasNoteIds(workspaceB.id)).length === 0, "Workspace B removes only its linked instance");

    const note = await api(`/api/notes/${noteId}`);
    assert.match(JSON.stringify(note.document), new RegExp(updatedHeadline), "Canonical Note survives linked instance removal");
    assert.deepEqual(await canvasNoteIds(workspaceA.id), [noteId], "Workspace A still holds its linked Note instance");
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
  }
});

test("embedded Note opens target via SPA navigation in edit and read views and renders missing targets", { timeout: 180_000 }, async () => {
  const token = `Embed${Date.now()}`;
  const workspaceA = await createWorkspace(`Embed Target ${token}`);
  const workspaceB = await createWorkspace(`Embed Host ${token}`);
  try {
    await openWorkspace(workspaceA.id);
    const targetId = await createNoteOnCanvas(workspaceA.id);
    const editor = "[data-note-element] .ProseMirror";
    const targetTitle = `${token} target architecture`;
    await fill(editor, targetTitle);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspaceB.id);
    const hostId = await createNoteOnCanvas(workspaceB.id);
    await expectFocused(editor);
    await typeText("/embed");
    await press("Enter");
    const embedSearch = 'input[aria-label="Search Note to embed"]';
    await visible(embedSearch);
    await fill(embedSearch, targetTitle);
    await click(role("button", new RegExp(targetTitle), { scope: role("listbox", "Canvas Note references") }));
    await visible(`[data-note-embed="${targetId}"]`);
    await waitSaved();

    const unsavedTrail = `flush before leaving ${token}`;
    await expectFocused(editor);
    await press("Enter");
    await typeText(unsavedTrail);
    await click(`[data-note-embed="${targetId}"] a`);
    await waitUrl(new RegExp(`/workspaces/${workspaceA.id}\\?noteId=${targetId}$`));
    await visible("[data-note-element]");
    await expectCount(editor, 0);
    assert.match(JSON.stringify((await api(`/api/notes/${hostId}`)).document), new RegExp(unsavedTrail), "SPA navigation from Edit view flushes unsaved edits");

    await openWorkspace(workspaceB.id);
    await expectCount(editor, 0);
    await visible(`[data-note-element] [data-note-read-view] [data-note-embed="${targetId}"] a`);
    await click(`[data-note-element] [data-note-read-view] [data-note-embed="${targetId}"] a`);
    await waitUrl(new RegExp(`/workspaces/${workspaceA.id}\\?noteId=${targetId}$`));
    await visible("[data-note-element]");

    const currentHost = await api(`/api/notes/${hostId}`);
    const missingId = `missing-note-${Date.now()}`;
    await api(`/api/notes/${hostId}`, {
      method: "PUT",
      body: {
        expectedRevision: currentHost.revision,
        document: {
          type: "doc",
          content: [
            ...(currentHost.document?.content ?? []),
            { type: "noteEmbed", attrs: { noteId: missingId, workspaceId: workspaceA.id, label: "Missing reference" } },
          ],
        },
      },
    });
    await openWorkspace(workspaceB.id);
    await containsText(`[data-note-embed="${missingId}"]`, `Missing Note: ${missingId}`);
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
  }
});

test("critical: Note spawns a connected blank Note and supports manual graph arrows", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Connector ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const sourceNoteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .ProseMirror`;
    await fill(editor, "Root note");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    const sourceBounds = await visualBox(card);
    await movePointer(sourceBounds.x + sourceBounds.width - 4, sourceBounds.y + sourceBounds.height / 2);
    await sleep(80);
    await visible(role("button", "Add connected shape right"));
    await press("Alt+ArrowRight");

    await waitFor(async () => (await count(card)) === 2, "Spawning adds a connected Note card");
    await visible(editor);
    await expectFocused(editor);
    await typeText("Child note");
    await waitSaved();

    const afterSpawn = await api(`/api/workspaces/${workspace.id}`);
    const live = (afterSpawn.canvas.data.elements ?? []).filter((candidate) => !candidate.isDeleted);
    const noteElements = live.filter((candidate) => candidate.customData?.notespaceNote);
    const arrows = live.filter((candidate) => candidate.type === "arrow");
    assert.equal(noteElements.length, 2, "Spawning creates a distinct second Note host");
    assert.equal(arrows.length, 1, "Spawning creates one connecting arrow");
    const childElement = noteElements.find((candidate) => candidate.customData.notespaceNote.noteId !== sourceNoteId);
    const sourceElement = noteElements.find((candidate) => candidate.customData.notespaceNote.noteId === sourceNoteId);
    assert.ok(childElement && sourceElement, "Both source and spawned Note have distinct Note identities");
    assert.equal(arrows[0].opacity, 100, "Connector arrow is visible even though Note hosts have opacity 0");
    assert.equal(arrows[0].startBinding?.elementId, sourceElement.id, "Connector starts bound to source Note");
    assert.equal(arrows[0].endBinding?.elementId, childElement.id, "Connector ends bound to spawned Note");
    assert.match(JSON.stringify((await api(`/api/notes/${childElement.customData.notespaceNote.noteId}`)).document), /Child note/);

    await press("Escape");
    await expectCount(editor, 0);
    await press("Delete");
    await waitFor(async () => (await canvasNoteRefs(workspace.id)).length === 1, "Deleting the spawned Note removes only its host");
    await waitSaved();
    const afterDelete = await api(`/api/workspaces/${workspace.id}`);
    const survivingArrows = (afterDelete.canvas.data.elements ?? []).filter((candidate) => !candidate.isDeleted && candidate.type === "arrow");
    assert.equal(survivingArrows.length, 1, "Deleting a Note keeps the graph arrow");
    assert.equal(survivingArrows[0].startBinding?.elementId, sourceElement.id, "Source binding stays attached");
    assert.equal(survivingArrows[0].endBinding, null, "Deleted Note binding is released cleanly");

    const currentSourceBounds = await visualBox(card);
    const toolbar = role("toolbar", "Canvas tools");
    await click(role("button", "Rectangle", { exact: true, scope: toolbar }));
    const shapeLeft = currentSourceBounds.x + currentSourceBounds.width + 80;
    const shapeTop = currentSourceBounds.y;
    await drag({ x: shapeLeft, y: shapeTop }, { x: shapeLeft + 100, y: shapeTop + 60 });
    await click(role("button", "Arrow", { exact: true, scope: toolbar }));
    await drag(
      { x: shapeLeft + 8, y: shapeTop + 30 },
      { x: currentSourceBounds.x + currentSourceBounds.width - 8, y: currentSourceBounds.y + currentSourceBounds.height / 2 },
    );
    await waitSaved();
    const afterManual = await api(`/api/workspaces/${workspace.id}`);
    const manualLive = (afterManual.canvas.data.elements ?? []).filter((candidate) => !candidate.isDeleted);
    const rect = manualLive.find((candidate) => candidate.type === "rectangle" && !candidate.customData?.notespaceNote);
    assert.ok(rect, "Manual shape created on Canvas");
    const boundArrows = manualLive.filter((candidate) => candidate.type === "arrow");
    assert.ok(
      boundArrows.some(
        (candidate) =>
          candidate.startBinding?.elementId === rect.id
          && candidate.endBinding?.elementId === sourceElement.id,
      ),
      `Manually drawn arrow binds between the Rectangle (${rect.id}) and the Note host (${sourceElement.id}); got: ${JSON.stringify(boundArrows.map((arrow) => ({ id: arrow.id, start: arrow.startBinding?.elementId, end: arrow.endBinding?.elementId })))}`,
    );
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("Note supports Expand modal, Info & backlinks, Place existing picker, and Extract to Note", { timeout: 180_000 }, async () => {
  const token = `Modal${Date.now()}`;
  const workspaceA = await createWorkspace(`Note Modal A ${token}`);
  const workspaceB = await createWorkspace(`Note Modal B ${token}`);
  try {
    await openWorkspace(workspaceA.id);
    const sourceNoteId = await createNoteOnCanvas(workspaceA.id);
    const card = "[data-note-element]";
    const editor = `${card} .ProseMirror`;
    await expectFocused(editor);
    const primaryHeading = `Primary heading ${token}`;
    const extractedBody = `Extracted paragraph ${token}`;
    await typeText(primaryHeading);
    await press("Enter");
    await typeText(extractedBody);
    await waitSaved();

    await press("Shift+Home");
    const formattingToolbar = role("toolbar", "Note formatting");
    await visible(formattingToolbar);
    await click(role("button", "Extract", { scope: formattingToolbar }));

    await expectCount(card, 2);
    await waitSaved();
    const afterExtract = await api(`/api/workspaces/${workspaceA.id}`);
    const live = (afterExtract.canvas.data.elements ?? []).filter((candidate) => !candidate.isDeleted);
    const extractedEl = live.find((candidate) => candidate.customData?.notespaceNote && candidate.customData.notespaceNote.noteId !== sourceNoteId);
    const sourceEl = live.find((candidate) => candidate.customData?.notespaceNote?.noteId === sourceNoteId);
    assert.ok(extractedEl && sourceEl, "Extract creates a distinct connected Note");
    const extractedNoteId = extractedEl.customData.notespaceNote.noteId;
    assert.ok(
      live.some((candidate) => candidate.type === "arrow" && candidate.startBinding?.elementId === sourceEl.id && candidate.endBinding?.elementId === extractedEl.id),
      "Extract connects the source Note and extracted Note with an arrow",
    );
    const sourceAfterExtract = await api(`/api/notes/${sourceNoteId}`);
    assert.match(JSON.stringify(sourceAfterExtract.document), new RegExp(`noteId=${extractedNoteId}`), "Source Note leaves a link to the extracted Note");

    await press("Escape");
    await expectCount(editor, 0);
    await clickAt(
      ...(await execute((id) => {
        const rect = document.querySelector(`[data-note-element="${id}"]`).getBoundingClientRect();
        return [rect.x + rect.width - 10, rect.y + 10];
      }, sourceEl.id)),
    );
    const noteActions = role("toolbar", "Canvas Note actions");
    await click(role("button", "More", { scope: noteActions }));
    await click(role("button", "Expand"));
    await visible("[data-note-focus-modal]");
    await visible("[data-note-focus-modal] .ProseMirror");
    await expectCount(`${card} .ProseMirror`, 0);

    await click("[data-note-focus-modal] .ProseMirror");
    await press("End");
    await typeText(" modal-edit");
    await waitSaved();
    await click(role("button", "Close focused Note"));
    await expectCount("[data-note-focus-modal]", 0);
    await containsText(`[data-note-element="${sourceEl.id}"]`, "modal-edit");

    await clickAt(
      ...(await execute((id) => {
        const rect = document.querySelector(`[data-note-element="${id}"]`).getBoundingClientRect();
        return [rect.x + rect.width - 10, rect.y + 10];
      }, extractedEl.id)),
    );
    await click(role("button", "More", { scope: noteActions }));
    await click(role("button", "Info & backlinks"));
    await visible("[data-note-info-popover]");
    await containsText("[data-note-info-popover]", workspaceA.title);
    await containsText("[data-note-info-popover]", primaryHeading);
    await click(role("button", "Close Note info"));
    await expectCount("[data-note-info-popover]", 0);

    await openWorkspace(workspaceB.id);
    await expectCount(card, 0);
    await click(role("button", "More tools", { exact: true, scope: role("toolbar", "Canvas tools") }));
    await click(role("button", "Place existing Note"));
    await visible("[data-note-picker-popover]");
    await fill(ariaLabel("Search Notes to place"), primaryHeading);
    await containsText("[data-note-picker-popover]", "1 Note");
    await expectCount(`[aria-label="Loading Notes"]`, 0);
    await click(role("option", new RegExp(primaryHeading)));
    await expectCount(card, 1);
    await containsText(card, "modal-edit");
    await waitSaved();
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
  }
});
