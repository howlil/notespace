/* Canvas-native Note creation, editing, persistence, and linked identity. */
import { after, before, test } from "node:test";
import {
  api, apiResponse, ariaLabel, assert, cleanupWorkspace, clearFault, click, clickAt, count, createWorkspace, doubleClick, drag, execute,
  containsText, expectFocused, expectCount, fill, injectFault, movePointer, openWorkspace, placeholder, press, role, sleep, start, stop, textOf, visible,
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
    const editor = `${card} .cm-content`;
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
    const editor = `${card} .cm-content`;
    await visible(card);
    await visible(editor);
    await expectFocused(editor);
    const heading = "Canvas-native Markdown";
    const authoredText = `# ${heading}\n\n- [x] Source survives reload`;
    await typeText(`# ${heading}`);
    await visible(`${editor} .note-md-heading-1`);
    await press("Enter");
    await press("Enter");
    await typeText("- [x] Source survives reload");
    await waitSaved();

    const stored = await api(`/api/workspaces/${workspace.id}`);
    const noteElement = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.ok(noteElement, "Canvas stores exactly one live Note reference");
    const noteId = noteElement.customData.notespaceNote.noteId;
    const current = await api(`/api/notes/${noteId}`);
    assert.deepEqual(current.document, { type: "markdown", text: authoredText });

    await press("Escape");
    await expectCount(editor, 0);
    await doubleClick(card);
    await visible(editor);
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspace.id);
    await visible(card);
    await containsText(`${card} h1`, heading);
    await visible(`${card} [data-type="taskItem"][data-checked="true"]`);
    const preview = await api(`/api/notes/${noteId}`);
    assert.deepEqual(preview.document, { type: "markdown", text: authoredText });
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

async function zoomInCanvas(steps = 2) {
  await execute((countSteps) => {
    const canvas = document.querySelector(".excalidraw__canvas.interactive");
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < countSteps; i += 1) {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true, cancelable: true, ctrlKey: true, deltaY: -12, deltaMode: 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
    }
  }, steps);
}

async function openNoteMenu(selector = "[data-note-element]") {
  await waitFor(async () => (await count(selector)) > 0, `Note element exists: ${selector}`);
  const rect = await execute((cssSelector) => {
    const { x, y, width, height } = document.querySelector(cssSelector).getBoundingClientRect();
    return { x, y, width, height };
  }, selector);
  await clickAt(rect.x + rect.width / 2, rect.y + 20, { button: 2 });
  const menu = role("menu", "Object context menu");
  await visible(menu);
  return menu;
}

async function createNoteOnCanvas(workspaceId) {
  const noteTool = '[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]';
  await visible(noteTool);
  await click(noteTool);
  await visible('[data-note-editing="true"] .cm-content');
  await waitSaved();
  const elementId = await execute(() => document.querySelector('[data-note-editing="true"]').getAttribute("data-note-element"));
  const stored = await api(`/api/workspaces/${workspaceId}`);
  const element = (stored.canvas.data.elements ?? []).find((candidate) => candidate.id === elementId && !candidate.isDeleted);
  assert.ok(element?.customData?.notespaceNote, "Canvas stores the created Note reference");
  return element.customData.notespaceNote.noteId;
}

test("critical: failed Note save keeps the draft and the retry persists it", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  let fault;
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .cm-content";
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
    await expectCount("[data-note-element] .cm-content", 0);
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
    const editor = "[data-note-element] .cm-content";
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
    const editor = `${card} .cm-content`;
    await expectFocused(editor);
    await fill(editor, "- [ ] buy milk");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);
    await click(`${card} [data-note-read-view] ul[data-type="taskList"] input[type="checkbox"]`);
    await waitSaved();

    await openWorkspace(workspace.id);
    await visible(card);
    await expectCount(`${card} [data-type="taskItem"][data-checked="true"]`, 1);
    assert.deepEqual((await api(`/api/notes/${noteId}`)).document, { type: "markdown", text: "- [x] buy milk" }, "checked state is saved in the Markdown source");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: Note edits flush before leaving the Canvas", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .cm-content";
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
    const editor = "[data-note-element] .cm-content";
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
    const editor = "[data-note-element] .cm-content";
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
    await fill(`${card} .cm-content`, text);
    await waitSaved();
    await press("Escape");
    await expectCount(`${card} .cm-content`, 0);
    await zoomInCanvas(2);
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
    const editor = "[data-note-element] .cm-content";
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

test("Note read view renders Markdown semantics and scales as one surface with zoom", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    await press("Escape");
    await expectCount(`${card} .cm-content`, 0);
    const stored = await api(`/api/workspaces/${workspace.id}`);
    const carrier = (stored.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.equal(carrier.opacity, 0, "The scene carrier is invisible; the card surface is drawn with theme tokens");

    const current = await api(`/api/notes/${noteId}`);
    const text = "## Rich heading\n\n- first item\n- second item\n\n**bold** [external](https://example.com/docs)";
    await api(`/api/notes/${noteId}`, { method: "PUT", body: { document: { type: "markdown", text }, expectedRevision: current.revision } });

    await openWorkspace(workspace.id);
    await visible(`${card} [data-note-read-view] h2`);
    await containsText(`${card} h2`, "Rich heading");
    await expectCount(`${card} ul li`, 2);
    await expectCount(`${card} strong`, 1);
    await expectCount(`${card} a[href="https://example.com/docs"][target="_blank"][rel~="noopener"]`, 1);
    await expectCount(`${card} .cm-content`, 0);

    const proportions = () => execute((selector) => {
      const surface = document.querySelector(selector);
      const heading = surface?.querySelector("h2");
      if (!surface || !heading) return null;
      return { cardWidth: surface.getBoundingClientRect().width, headingRatio: heading.getBoundingClientRect().height / surface.getBoundingClientRect().width };
    }, card);
    const before = await proportions();
    await zoomInCanvas(2);
    await waitFor(async () => (await proportions()).cardWidth > before.cardWidth * 1.1, "Zooming in enlarges the card");
    const after = await proportions();
    assert.ok(Math.abs(after.headingRatio - before.headingRatio) / before.headingRatio < 0.03, `Content scales with the card (${before.headingRatio} vs ${after.headingRatio})`);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("critical: typed Markdown source survives save and reload exactly", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .cm-content`;
    const source = "## Plan\n- first\n- second\n\nclosing paragraph\n\n```js\nconst small = 1 < 2;\n```";
    await expectFocused(editor);
    await fill(editor, source);
    await waitSaved();
    assert.deepEqual((await api(`/api/notes/${noteId}`)).document, { type: "markdown", text: source }, "Saved text equals what was typed");

    await press("Escape");
    await openWorkspace(workspace.id);
    await visible(`${card} [data-note-read-view] h2`);
    await expectCount(`${card} ul li`, 2);
    await containsText(`${card} pre code`, "const small = 1 < 2;");
    assert.deepEqual((await api(`/api/notes/${noteId}`)).document, { type: "markdown", text: source }, "Reload does not rewrite the source");
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
    await fill("[data-note-element] .cm-content", text);
    await waitSaved();
    await press("Escape");
    await expectCount("[data-note-element] .cm-content", 0);
    await press("Enter");
    await visible("[data-note-element] .cm-content");
    await expectCount(role("menu", "Object context menu"), 0);
    await press("Escape");
    await expectCount("[data-note-element] .cm-content", 0);
    const menu = await openNoteMenu();
    await expectCount(role("button", "AI writing"), 0);
    await expectCount(role("button", "Import .md"), 0);
    await click(role("menuitem", /Duplicate/, { scope: menu }));
    await waitFor(async () => (await canvasNoteIds(workspace.id)).length === 2, "Duplicate adds a second Canvas instance");
    const ids = await canvasNoteIds(workspace.id);
    assert.ok(ids.includes(sourceId), "The source Note keeps its identity");
    const copyId = ids.find((id) => id !== sourceId);
    assert.ok(copyId, "The duplicate references a different Note");
    await waitFor(async () => JSON.stringify((await api(`/api/notes/${copyId}`)).document).includes(text), "The new Note carries the copied content");
    const source = await api(`/api/notes/${sourceId}`);
    assert.match(JSON.stringify(source.document), new RegExp(text), "Editing the copy later must not change the source; the source still has its text");

    await click(role("menuitem", /Remove instance/, { scope: await openNoteMenu() }));
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
    await fill("[data-note-element] .cm-content", text);
    await waitSaved();
    await press("Escape");
    await expectCount("[data-note-element] .cm-content", 0);
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
    const editor = "[data-note-element] .cm-content";
    const initialHeadline = `${token} alpha headline`;
    await fill(editor, initialHeadline);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspaceB.id);
    await expectCount("[data-note-element]", 0);
    await click(role("button", "Search Notespace", { exact: true }));
    await fill(placeholder("Search workspaces or notes…"), initialHeadline);
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
    await click(role("menuitem", /Remove instance/, { scope: await openNoteMenu() }));
    await waitFor(async () => (await canvasNoteIds(workspaceB.id)).length === 0, "Workspace B removes only its linked instance");

    const note = await api(`/api/notes/${noteId}`);
    assert.match(JSON.stringify(note.document), new RegExp(updatedHeadline), "Canonical Note survives linked instance removal");
    assert.deepEqual(await canvasNoteIds(workspaceA.id), [noteId], "Workspace A still holds its linked Note instance");
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
  }
});

test("embedded Note opens its target through SPA navigation and renders missing targets", { timeout: 180_000 }, async () => {
  const token = `Embed${Date.now()}`;
  const workspaceA = await createWorkspace(`Embed Target ${token}`);
  const workspaceB = await createWorkspace(`Embed Host ${token}`);
  const editor = "[data-note-element] .cm-content";
  const putHost = async (hostId, text) => {
    const current = await api(`/api/notes/${hostId}`);
    await api(`/api/notes/${hostId}`, { method: "PUT", body: { document: { type: "markdown", text }, expectedRevision: current.revision } });
  };
  try {
    await openWorkspace(workspaceA.id);
    const targetId = await createNoteOnCanvas(workspaceA.id);
    const targetTitle = `${token} target architecture`;
    await fill(editor, targetTitle);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspaceB.id);
    const hostId = await createNoteOnCanvas(workspaceB.id);
    await fill(editor, "Host note");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);
    await putHost(hostId, `Host note\n\n![Embedded](/workspaces/${workspaceA.id}?noteId=${targetId})`);

    await openWorkspace(workspaceB.id);
    const embedLink = `[data-note-element] [data-note-read-view] [data-note-embed="${targetId}"] a`;
    await visible(embedLink);
    await containsText(`[data-note-embed="${targetId}"]`, targetTitle);
    await click(embedLink);
    await waitUrl(new RegExp(`/workspaces/${workspaceA.id}\\?noteId=${targetId}$`));
    await visible("[data-note-element]");

    const missingId = `missing-note-${Date.now()}`;
    await putHost(hostId, `Host note\n\n![Missing reference](/workspaces/${workspaceA.id}?noteId=${missingId})`);
    await openWorkspace(workspaceB.id);
    await containsText(`[data-note-embed="${missingId}"]`, `Missing Note: ${missingId}`);
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
  }
});

test("advanced Markdown supports image paste, math validation recovery, tables, and callouts", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Rich ${Date.now()}`);
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .cm-content`;
    const readView = `${card} [data-note-read-view]`;
    await expectFocused(editor);

    await execute((selector, base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "diagram.png", { type: "image/png" }));
      document.querySelector(selector).dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, editor, tinyPng.toString("base64"));
    await waitFor(async () => /!\[diagram\.png\]\(\/api\/workspaces\/[^)]+\/assets\/[^)]+\)/.exec((await api(`/api/notes/${noteId}`)).document.text) !== null, "Pasted image is stored as a Markdown image");
    const imageLine = (await api(`/api/notes/${noteId}`)).document.text.trim();

    await press("Enter");
    await typeText("$$");
    await press("Enter");
    await typeText("\\frac{1");
    await press("Enter");
    await typeText("$$");
    await waitSaved();
    await press("Escape");
    await visible(`${readView} [data-math-error="true"]`);
    assert.ok((await api(`/api/notes/${noteId}`)).document.text.includes("\\frac{1"), "An invalid formula is shown as an error and never discarded");

    const current = await api(`/api/notes/${noteId}`);
    const text = `${imageLine}\n\n$$\na^2 + b^2 = c^2\n$$\n\n| Header 1 | Header 2 |\n| --- | --- |\n| a | b |\n\n> [!note]\n> Important callout reminder`;
    await api(`/api/notes/${noteId}`, { method: "PUT", body: { document: { type: "markdown", text }, expectedRevision: current.revision } });

    await openWorkspace(workspace.id);
    await visible(`${readView} img[src*="/assets/"]`);
    await visible(`${readView} .notespace-note-math[data-latex="a^2 + b^2 = c^2"] .katex`);
    await containsText(`${readView} table`, "Header 1");
    await containsText(`${readView} [data-note-callout="note"]`, "Important callout reminder");
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

test("critical: Note spawns a connected blank Note and supports manual graph arrows", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Connector ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const sourceNoteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .cm-content`;
    await fill(editor, "Root note");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    // Note is selected after exiting edit; hover the right edge to verify the '+' connector handle, then spawn with Alt+ArrowRight.
    const sourceBounds = await visualBox(card);
    await movePointer(sourceBounds.x + sourceBounds.width - 4, sourceBounds.y + sourceBounds.height / 2);
    await sleep(80);
    await visible(role("button", "Add connected shape right"));
    await press("Alt+ArrowRight");

    // Spawning creates a second blank Note card, immediately focused for writing, connected by a visible arrow.
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

    // Deleting the spawned Note keeps the arrow with its deleted end binding released cleanly.
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

    // Manual arrow drawing from a Rectangle to the Note binds into the Note host.
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

test("Note fold geometry, card colors, and Alt+DoubleClick placement persist across reload", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Fold ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .cm-content`;
    await fill(editor, "Foldable headline\nSecond body line\nThird body line");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    const unfoldedBox = await visualBox(card);
    assert.ok(unfoldedBox.height >= 170, `Unfolded height starts at normal card height (got ${unfoldedBox.height})`);

    await click(role("menuitem", "Fold", { exact: true, scope: await openNoteMenu(card) }));
    await visible(`${card}[data-note-compact="true"]`);
    await waitFor(async () => Math.abs((await visualBox(card)).height - 48) < 4, "Folded card collapses to 48px");
    await waitSaved();

    const storedFolded = await api(`/api/workspaces/${workspace.id}`);
    const foldedEl = (storedFolded.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.equal(foldedEl?.customData?.notespaceNote?.compact, true);
    assert.equal(Math.round(foldedEl?.height ?? 0), 48);

    const foldedMenu = await openNoteMenu(card);
    await visible(role("menuitem", "Unfold", { exact: true, scope: foldedMenu }));
    await click(role("menuitem", "Unfold", { exact: true, scope: foldedMenu }));
    await visible(`${card}:not([data-note-compact="true"])`);
    await waitFor(async () => (await visualBox(card)).height >= 170, "Unfolding restores original card height");

    const currentBox = await visualBox(card);
    await clickAt(currentBox.x + currentBox.width / 2, currentBox.y + currentBox.height / 2);
    await press("Control+Alt+Enter");
    await visible(`${card}[data-note-compact="true"]`);
    await press("Control+Alt+Enter");
    await visible(`${card}:not([data-note-compact="true"])`);

    const styleMenu = await openNoteMenu(card);
    await click(role("button", "Card color blue", { scope: styleMenu }));
    await visible(`${card}[data-note-color="blue"]`);
    await click(role("button", "Card shape square", { scope: styleMenu }));
    await visible(`${card}[data-note-shape="square"]`);
    await press("Escape");
    await waitSaved();

    await openWorkspace(workspace.id);
    await visible(`${card}[data-note-color="blue"]`);
    await visible(`${card}[data-note-shape="square"]`);

    const placedBox = await visualBox(card);
    const emptyPoint = await execute((box) => {
      const rect = document.querySelector(".excalidraw__canvas").getBoundingClientRect();
      return {
        x: Math.min(rect.right - 80, Math.max(rect.left + 80, box.x + box.width + 180)),
        y: Math.min(rect.bottom - 80, Math.max(rect.top + 80, box.y + 80)),
      };
    }, placedBox);
    await execute((x, y) => {
      const canvas = document.querySelector(".excalidraw__canvas");
      canvas.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        altKey: true,
        clientX: x,
        clientY: y,
      }));
    }, emptyPoint.x, emptyPoint.y);

    await expectCount(card, 2);
    await visible(editor);
    await expectFocused(editor);
    await typeText("Placed via Alt double click");
    await waitSaved();
    assert.equal((await canvasNoteIds(workspace.id)).length, 2, "Alt+DoubleClick creates and persists a second Note");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("read-mode checklist and toggle stay interactive without editing and Delete restores via Undo", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Read Interactive ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .cm-content`;
    await expectFocused(editor);
    await fill(editor, "- [ ] Read-mode task\n\n<details open>\n<summary>Toggle summary</summary>\n\nToggle hidden body\n\n</details>");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await visible(`${card} [data-note-read-view] div[data-note-toggle][data-open="true"]`);
    await containsText(card, "Toggle hidden body");

    await click(`${card} [data-note-read-view] input[type="checkbox"]`);
    await visible(`${card} [data-type="taskItem"][data-checked="true"]`);
    await expectCount(editor, 0);

    await click(`${card} [data-note-read-view] .notespace-note-toggle-trigger`);
    await visible(`${card} [data-note-read-view] div[data-note-toggle][data-open="false"]`);
    await expectCount(editor, 0);
    await waitSaved();

    await openWorkspace(workspace.id);
    await visible(`${card} [data-type="taskItem"][data-checked="true"]`);
    await visible(`${card} [data-note-read-view] div[data-note-toggle][data-open="false"]`);
    const savedText = (await api(`/api/notes/${noteId}`)).document.text;
    assert.match(savedText, /^- \[x\] Read-mode task$/m);
    assert.match(savedText, /^<details>$/m);

    const cardBox = await visualBox(card);
    await clickAt(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await press("Delete");
    await expectCount(card, 0);
    await containsText('[aria-label="Notifications"]', "Note removed from Canvas. The Note itself remains.");
    await click(role("button", "Undo", { scope: role("region", "Notifications") }));
    await expectCount(card, 1);
    await containsText(card, "Read-mode task");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});

test("Note supports Expand modal, Info & backlinks, and the Place existing picker", { timeout: 180_000 }, async () => {
  const token = `Slice23${Date.now()}`;
  const workspaceA = await createWorkspace(`Note Modal A ${token}`);
  const workspaceB = await createWorkspace(`Note Modal B ${token}`);
  try {
    await openWorkspace(workspaceA.id);
    const sourceNoteId = await createNoteOnCanvas(workspaceA.id);
    const card = "[data-note-element]";
    const editor = `${card} .cm-content`;
    const primaryHeading = `Primary heading ${token}`;
    await expectFocused(editor);
    await fill(editor, primaryHeading);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    const linkedNoteId = await createNoteOnCanvas(workspaceA.id);
    await fill(editor, `Linked target ${token}`);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);
    const source = await api(`/api/notes/${sourceNoteId}`);
    await api(`/api/notes/${sourceNoteId}`, {
      method: "PUT",
      body: { document: { type: "markdown", text: `${primaryHeading}\n\n[Linked](/workspaces/${workspaceA.id}?noteId=${linkedNoteId})` }, expectedRevision: source.revision },
    });
    await openWorkspace(workspaceA.id);
    await expectCount(card, 2);
    const elements = (await api(`/api/workspaces/${workspaceA.id}`)).canvas.data.elements.filter((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    const sourceEl = elements.find((candidate) => candidate.customData.notespaceNote.noteId === sourceNoteId);
    const linkedEl = elements.find((candidate) => candidate.customData.notespaceNote.noteId === linkedNoteId);

    await click(role("menuitem", "Expand", { exact: true, scope: await openNoteMenu(`[data-note-element="${sourceEl.id}"]`) }));
    await visible("[data-note-focus-modal]");
    await visible("[data-note-focus-modal] .cm-content");
    await expectCount(`${card} .cm-content`, 0);

    await click("[data-note-focus-modal] .cm-content");
    await press("Control+End");
    await typeText(" modal-edit");
    await waitSaved();
    await click(role("button", "Close focused Note"));
    await expectCount("[data-note-focus-modal]", 0);
    await containsText(`[data-note-element="${sourceEl.id}"]`, "modal-edit");

    await click(role("menuitem", "Info & backlinks", { exact: true, scope: await openNoteMenu(`[data-note-element="${linkedEl.id}"]`) }));
    await visible("[data-note-info-popover]");
    await containsText("[data-note-info-popover]", workspaceA.title);
    await containsText("[data-note-info-popover]", primaryHeading);
    await click(role("button", "Close Note info"));
    await expectCount("[data-note-info-popover]", 0);

    await openWorkspace(workspaceB.id);
    await expectCount(card, 0);
    await createNoteOnCanvas(workspaceB.id);
    await press("Escape");
    await expectCount(`${card} .cm-content`, 0);
    await click(role("menuitem", "Place existing Note", { exact: true, scope: await openNoteMenu(card) }));
    await visible("[data-note-picker-popover]");
    await fill(ariaLabel("Search Notes to place"), primaryHeading);
    // The picker clears its options while a search is in flight and then re-renders them.
    // Wait for the filtered ready summary so the option click targets the final list, not a replaced node.
    await containsText("[data-note-picker-popover]", "1 Note");
    await expectCount(`[aria-label="Loading Notes"]`, 0);
    await click(role("option", new RegExp(primaryHeading)));
    await expectCount(card, 2);
    await waitFor(async () => (await canvasNoteIds(workspaceB.id)).includes(sourceNoteId), "Placed existing Note persists on Workspace B");
    await waitSaved();
  } finally {
    await cleanupWorkspace(workspaceA.id);
    await cleanupWorkspace(workspaceB.id);
  }
});

test("Note renders the inline HTML allowlist and shows anything else as literal text", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Inline HTML ${Date.now()}`);
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    await press("Escape");
    await expectCount(`${card} .cm-content`, 0);
    const current = await api(`/api/notes/${noteId}`);
    const text = [
      '<mark data-tone="yellow">Marked</mark> <span data-color="blue">Colored</span> <u>Underlined</u>',
      "",
      "<script>window.__noteXss = 1</script>",
      "",
      'Inline <img src=x onerror="window.__noteXss = 2"> and [bad](javascript:window.__noteXss=3)',
    ].join("\n");
    await api(`/api/notes/${noteId}`, { method: "PUT", body: { document: { type: "markdown", text }, expectedRevision: current.revision } });

    await openWorkspace(workspace.id);
    const readView = `${card} [data-note-read-view]`;
    await visible(`${readView} mark[data-note-highlight="yellow"]`);
    await visible(`${readView} span[data-note-text-color="blue"]`);
    await visible(`${readView} u`);
    await containsText(readView, "<script>window.__noteXss = 1</script>");
    await expectCount(`${readView} script, ${readView} img[onerror], ${readView} a[href^="javascript:"]`, 0);
    assert.equal(await execute(() => window.__noteXss ?? null), null, "No authored HTML or link ran script");
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
