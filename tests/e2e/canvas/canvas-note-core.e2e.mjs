/* Canvas-native Note core lifecycle: creation, persistence, undo, conflicts, and geometry. */
import { after, before, test } from "node:test";
import {
  api, apiResponse, assert, cleanupWorkspace, clearFault, click, count, createWorkspace, doubleClick, drag, execute,
  containsText, expectFocused, expectCount, fill, injectFault, openWorkspace, press, role, start, stop, textOf, visible,
  typeText, waitFor, waitUrl,
} from "../support/harness.mjs";
import { canvasNoteIds, createNoteOnCanvas, visualBox, waitSaved } from "./note-helpers.mjs";

before(start);
after(stop);

test("critical: blank Canvas Note stays blank after exiting edit", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteTool = '[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]';
    await visible(noteTool);
    await click(noteTool);

    const card = "[data-note-element]";
    const editor = `${card} .ProseMirror`;
    await visible(card);
    await visible(editor);
    await expectFocused(editor);
    await press("Escape");
    await expectCount(editor, 0);
    assert.equal((await textOf(card)).trim(), "", "A new blank Note must not gain placeholder body text after editing exits");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: Note creates one focused pure card and survives reload", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteTool = '[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]';
    await visible(noteTool);
    await click(noteTool);

    const card = "[data-note-element]";
    const editor = `${card} .ProseMirror`;
    await visible(card);
    await visible(editor);
    await expectFocused(editor);
    const authoredText = "Canvas-native note survives typed autosave";
    await fill(editor, authoredText);
    await waitSaved();

    const stored = await api(`/api/workspaces/${workspace.id}`);
    const noteElement = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.ok(noteElement, "Canvas stores exactly one live Note reference");
    const noteId = noteElement.customData.notespaceNote.noteId;
    const current = await api(`/api/notes/${noteId}`);
    assert.match(JSON.stringify(current.document), new RegExp(authoredText));

    await press("Escape");
    await expectCount(editor, 0);
    await doubleClick(card);
    await visible(editor);
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspace.id);
    await visible(card);
    await visible(`${card} p`);
    await containsText(card, authoredText);
    const preview = await api(`/api/notes/${noteId}`);
    assert.match(JSON.stringify(preview.document), new RegExp(authoredText));
    const cardBounds = await visualBox(card);
    assert.ok(cardBounds.width >= 160 && cardBounds.height >= 48, "Note remains a valid visible Canvas instance");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: failed Note save keeps the draft and the retry persists it", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  let fault;
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    const draft = "draft kept through a failed save";
    fault = await injectFault({
      method: "PUT",
      path: `/api/notes/${noteId}`,
      times: 1,
      respond: () => ({ status: 503, body: JSON.stringify({ error: "Note save failure" }) }),
    });
    await fill(editor, draft);
    await waitFor(async () => (await count(role("button", "Retry save"))) > 0, "Failed Note save exposes Retry save");
    assert.match(await textOf(editor), /draft kept through a failed save/, "Local draft stays visible after a failed save");
    assert.doesNotMatch(JSON.stringify((await api(`/api/notes/${noteId}`)).document), /draft kept/, "Server did not accept the failed write");
    await clearFault(fault);
    fault = null;
    await click(role("button", "Retry save"));
    await waitSaved();
    assert.match(JSON.stringify((await api(`/api/notes/${noteId}`)).document), /draft kept through a failed save/, "Retry persists the draft");
  } finally {
    if (fault) await clearFault(fault);
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: undo removes a just-created Note instance and keeps no orphan reference", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    await press("Escape");
    await expectCount("[data-note-element] .ProseMirror", 0);
    await press("Control+z");
    await expectCount("[data-note-element]", 0);
    await waitSaved();
    const stored = await api(`/api/workspaces/${workspace.id}`);
    const live = (stored.canvas.data.elements ?? []).filter((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.equal(live.length, 0, "Undo leaves no live Note reference on the Canvas");
    await click(role("link", "Notespace home", { exact: true }));
    await waitUrl(/\/$/);
    await waitFor(async () => (await apiResponse(`/api/notes/${noteId}`)).status === 404, "undone empty Note is removed after leaving the workspace");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: undo reverts a typed Note edit and the saved Note follows", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    await expectFocused(editor);
    const typed = "undo target text";
    await fill(editor, typed);
    await waitSaved();
    assert.match(JSON.stringify((await api(`/api/notes/${noteId}`)).document), new RegExp(typed), "typed text is saved before undo");
    await expectFocused(editor);
    await press("Control+z");
    await waitFor(async () => !JSON.stringify((await api(`/api/notes/${noteId}`)).document).includes(typed), "Undo removes the typed text from the saved Note");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: checklist state persists after reload", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .ProseMirror`;
    await expectFocused(editor);
    await typeText("/checklist");
    await press("Enter");
    await typeText("buy milk");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);
    await doubleClick(card);
    await visible(editor);
    await click(`${card} ul[data-type="taskList"] input[type="checkbox"]`);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspace.id);
    await visible(card);
    await expectCount(`${card} [data-type="taskItem"][data-checked="true"]`, 1);
    assert.match(JSON.stringify((await api(`/api/notes/${noteId}`)).document), /"checked":true/, "checked state is saved in the canonical Note");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: Note edits flush before leaving the Canvas", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    const typed = "typed right before leaving the canvas";
    await fill(editor, typed);
    await click(role("link", "Notespace home", { exact: true }));
    await waitUrl(/\/$/);
    assert.match(JSON.stringify((await api(`/api/notes/${noteId}`)).document), new RegExp(typed), "Note content saved before navigation");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: Note 409 conflict surfaces Recover and rebases the local draft on explicit recovery", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  let fault;
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    const draft = "draft that hit a revision conflict";
    fault = await injectFault({
      method: "PUT",
      path: `/api/notes/${noteId}`,
      times: 1,
      respond: () => ({ status: 409, body: JSON.stringify({ error: "Note revision conflict" }) }),
    });
    await fill(editor, draft);
    await waitFor(async () => (await count(role("button", "Recover Note"))) > 0, "Conflicting Note write exposes Recover Note");
    assert.match(await textOf(editor), /draft that hit a revision conflict/, "Local draft survives the conflict");
    await clearFault(fault);
    fault = null;
    await click(role("button", "Recover Note"));
    await waitFor(async () => JSON.stringify((await api(`/api/notes/${noteId}`)).document).includes("draft that hit a revision conflict"), "Explicit recovery persists the draft");
  } finally {
    if (fault) await clearFault(fault);
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: Note rate-limited save (429) is a recoverable failure with Retry save", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  let fault;
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    fault = await injectFault({
      method: "PUT",
      path: `/api/notes/${noteId}`,
      times: 1,
      respond: () => ({ status: 429, body: JSON.stringify({ error: "Too many Note writes" }) }),
    });
    await fill(editor, "rate limited draft");
    await waitFor(async () => (await count(role("button", "Retry save"))) > 0, "Rate-limited Note save exposes Retry save");
    await clearFault(fault);
    fault = null;
    await click(role("button", "Retry save"));
    await waitSaved();
    assert.match(JSON.stringify((await api(`/api/notes/${noteId}`)).document), /rate limited draft/, "Retry persists the rate-limited draft");
  } finally {
    if (fault) await clearFault(fault);
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: Note moves and resizes at a non-default zoom and keeps its content", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const text = "zoomed note keeps its text";
    await fill(`${card} .ProseMirror`, text);
    await waitSaved();
    await press("Escape");
    await expectCount(`${card} .ProseMirror`, 0);
    await click(role("button", "More canvas actions", { scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Zoom in", { scope: role("dialog", "Canvas options") }));
    await click(role("button", "More canvas actions", { scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Zoom in", { scope: role("dialog", "Canvas options") }));
    const storedGeometry = async () => {
      const stored = await api(`/api/workspaces/${workspace.id}`);
      const element = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
      return { x: element.x, y: element.y, width: element.width, height: element.height };
    };
    const before = await storedGeometry();
    const cardBox = await visualBox(card);
    await drag({ x: cardBox.x + cardBox.width / 2, y: cardBox.y + cardBox.height / 2 },
      { x: cardBox.x + cardBox.width / 2 + 120, y: cardBox.y + cardBox.height / 2 + 60 });
    await waitFor(async () => (await storedGeometry()).x !== before.x, "Dragging moves the Note instance");
    await waitSaved();
    const moved = await storedGeometry();
    assert.ok(Math.abs(moved.width - before.width) < 1 && Math.abs(moved.height - before.height) < 1, "Move must not change size");

    const movedBox = await visualBox(card);
    await drag({ x: movedBox.x + movedBox.width, y: movedBox.y + movedBox.height },
      { x: movedBox.x + movedBox.width + 60, y: movedBox.y + movedBox.height + 30 });
    await waitFor(async () => (await storedGeometry()).width > moved.width + 10, "Corner drag resizes the Note instance");
    await waitSaved();
    const resized = await storedGeometry();
    assert.ok(resized.width > moved.width, "Resize grows the width");
    const stored = await api(`/api/notes/${noteId}`);
    assert.match(JSON.stringify(stored.document), new RegExp(text), "Geometry changes never touch note content");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: multi-selected Notes stay intact and removing instances keeps canonical Notes", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    const texts = ["first multi-select note", "second multi-select note"];
    const noteTool = '[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]';
    for (const text of texts) {
      await visible(noteTool);
      await click(noteTool);
      await visible(editor);
      await fill(editor, text);
      await waitSaved();
      await press("Escape");
      await expectCount(editor, 0);
    }
    const ids = await canvasNoteIds(workspace.id);
    assert.equal(ids.length, 2, "Two live Note instances exist before selection");

    const boxes = await execute(() => [...document.querySelectorAll("[data-note-element]")].map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    assert.equal(boxes.length, 2, "Both Note cards are rendered");
    const left = Math.min(...boxes.map((b) => b.x)) - 30;
    const top = Math.min(...boxes.map((b) => b.y)) - 30;
    const right = Math.max(...boxes.map((b) => b.x + b.width)) + 30;
    const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + 30;
    await drag({ x: left, y: top }, { x: right, y: bottom });
    await containsText(role("toolbar", "Selected shape actions"), "2 selected");

    await press("Delete");
    await waitFor(async () => (await canvasNoteIds(workspace.id)).length === 0, "Removing the selected instances clears the Canvas references");
    for (const id of ids) {
      const note = await api(`/api/notes/${id}`);
      assert.ok(note.document, "Canonical Note survives instance removal");
    }
    const kept = await Promise.all(ids.map(async (id) => JSON.stringify((await api(`/api/notes/${id}`)).document)));
    assert.ok(kept.some((document) => document.includes(texts[0])) && kept.some((document) => document.includes(texts[1])), "Both Note texts survive multi-select removal");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
