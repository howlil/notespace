/* Canvas-native Note creation, editing, persistence, and linked identity. */
import { after, before, test } from "node:test";
import {
  api, assert, box, cleanupWorkspace, click, createWorkspace, doubleClick,
  containsText, expectFocused, expectCount, fill, openWorkspace, press, start, stop, textOf, visible,
  waitSaved,
} from "../support/harness.mjs";

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
    const cardBounds = await box(card);
    assert.ok(cardBounds.width >= 160 && cardBounds.height >= 48, "Note remains a valid visible Canvas instance");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
