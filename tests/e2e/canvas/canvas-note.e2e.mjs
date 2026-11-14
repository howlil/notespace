/* Canvas-native Note creation, editing, persistence, and linked identity. */
import { after, before, test } from "node:test";
import {
  api, apiResponse, assert, cleanupWorkspace, clearFault, click, count, createWorkspace, doubleClick, drag, execute,
  containsText, expectFocused, expectCount, fill, injectFault, openWorkspace, press, role, start, stop, textOf, visible,
  requestLog, typeText, waitFor, waitSaved as harnessWaitSaved, waitUrl,
} from "../support/harness.mjs";

/**
 * Waits for the workspace save status to read "Saved". On timeout it records what the Note
 * layer and the request log saw, so a flaky run leaves evidence instead of a bare timeout.
 */
async function waitSaved() {
  try {
    await harnessWaitSaved();
  } catch (error) {
    const snapshot = await execute(() => ({
      status: document.querySelector('[aria-label="Workspace save status"]')?.textContent,
      noteDots: [...document.querySelectorAll("[data-note-save]")].map((node) => node.getAttribute("data-note-save")),
      cards: [...document.querySelectorAll("[data-note-element]")].map((node) => node.getAttribute("data-note-state")),
    }));
    const recent = (await requestLog()).slice(-10).map((entry) => `${entry.method} ${entry.path}`);
    console.log("WAITSAVED_TIMEOUT", JSON.stringify({ snapshot, recent }));
    throw error;
  }
}

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

/** On-screen bounds: Note cards are zoom-scaled with a CSS transform, which WebDriver's rect omits. */
async function visualBox(selector) {
  await visible(selector);
  return execute((cssSelector) => {
    const { x, y, width, height } = document.querySelector(cssSelector).getBoundingClientRect();
    return { x, y, width, height };
  }, selector);
}

async function createNoteOnCanvas(workspaceId) {
  const noteTool = '[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]';
  await visible(noteTool);
  await click(noteTool);
  await visible("[data-note-element] .ProseMirror");
  await waitSaved();
  const stored = await api(`/api/workspaces/${workspaceId}`);
  const element = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
  assert.ok(element, "Canvas stores the created Note reference");
  return element.customData.notespaceNote.noteId;
}

test("critical: failed Note save keeps the draft and the retry persists it", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  let fault;
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";
    const draft = "draft kept through a failed save";
    fault = await injectFault({ method: "PUT", path: `/api/notes/${noteId}`, times: 1,
      respond: () => ({ status: 503, body: JSON.stringify({ error: "Note save failure" }) }) });
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
    fault = await injectFault({ method: "PUT", path: `/api/notes/${noteId}`, times: 1,
      respond: () => ({ status: 409, body: JSON.stringify({ error: "Note revision conflict" }) }) });
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
    fault = await injectFault({ method: "PUT", path: `/api/notes/${noteId}`, times: 1,
      respond: () => ({ status: 429, body: JSON.stringify({ error: "Too many Note writes" }) }) });
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
    await click(role("button", "Zoom in", { scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Zoom in", { scope: role("toolbar", "Canvas view controls") }));
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

async function canvasNoteIds(workspaceId) {
  const stored = await api(`/api/workspaces/${workspaceId}`);
  return (stored.canvas.data.elements ?? [])
    .filter((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote)
    .map((candidate) => candidate.customData.notespaceNote.noteId);
}

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

test("Note read view renders rich semantic content and scales as one surface with zoom", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    await press("Escape");
    await expectCount(`${card} .ProseMirror`, 0);
    const stored = await api(`/api/workspaces/${workspace.id}`);
    const carrier = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.equal(carrier.opacity, 0, "The scene carrier is invisible; the card surface is drawn with theme tokens");

    const current = await api(`/api/notes/${noteId}`);
    const richDocument = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Rich heading" }] },
      { type: "bulletList", content: ["first item", "second item"].map((text) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
      { type: "paragraph", content: [
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " external", marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }] },
      ] },
    ] };
    await api(`/api/notes/${noteId}`, { method: "PUT", body: { document: richDocument, expectedRevision: current.revision } });

    await openWorkspace(workspace.id);
    await visible(`${card} [data-note-read-view] h2`);
    await containsText(`${card} h2`, "Rich heading");
    await expectCount(`${card} ul li`, 2);
    await expectCount(`${card} strong`, 1);
    await expectCount(`${card} a[href="https://example.com/docs"][target="_blank"][rel~="noopener"]`, 1);
    await expectCount(`${card} .ProseMirror`, 0);

    const proportions = () => execute((selector) => {
      const surface = document.querySelector(selector);
      const heading = surface?.querySelector("h2");
      if (!surface || !heading) return null;
      return { cardWidth: surface.getBoundingClientRect().width, headingRatio: heading.getBoundingClientRect().height / surface.getBoundingClientRect().width };
    }, card);
    const before = await proportions();
    await click(role("button", "Zoom in", { scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Zoom in", { scope: role("toolbar", "Canvas view controls") }));
    await waitFor(async () => (await proportions()).cardWidth > before.cardWidth * 1.1, "Zooming in enlarges the card");
    const after = await proportions();
    assert.ok(Math.abs(after.headingRatio - before.headingRatio) / before.headingRatio < 0.03, `Content scales with the card (${before.headingRatio} vs ${after.headingRatio})`);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: rich formatting typed in a Note saves with unique block identities", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    await typeText("## Plan");
    await press("Enter");
    await typeText("- first");
    await press("Enter");
    await typeText("second");
    await press("Enter");
    await press("Enter");
    await typeText("closing paragraph");
    await waitSaved();
    const stored = await api(`/api/notes/${noteId}`);
    const blocks = [];
    const walk = (nodes = []) => nodes.forEach((node) => {
      if (node.attrs && "blockId" in node.attrs) blocks.push({ type: node.type, blockId: node.attrs.blockId });
      walk(node.content);
    });
    walk(stored.document.content);
    const types = blocks.map(({ type }) => type);
    assert.ok(types.includes("heading") && types.includes("bulletList"), `Input rules produce semantic blocks: ${types.join(",")}`);
    assert.ok(blocks.every(({ blockId }) => typeof blockId === "string" && blockId.length > 0), "Every block has an identity");
    assert.equal(new Set(blocks.map(({ blockId }) => blockId)).size, blocks.length, "Split blocks never share an identity");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

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
    await expectCount(role("button", "AI writing"), 0);
    await expectCount(role("button", "Import .md"), 0);
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

async function canvasNoteRefs(workspaceId) {
  const stored = await api(`/api/workspaces/${workspaceId}`);
  return (stored.canvas.data.elements ?? [])
    .filter((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote)
    .map((candidate) => candidate.customData.notespaceNote);
}
