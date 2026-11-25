/* Canvas-native Note rich content, formatting, read-mode interactivity, and card presentation. */
import { after, before, test } from "node:test";
import {
  api, ariaLabel, assert, cleanupWorkspace, click, clickAt, createWorkspace, execute,
  containsText, expectFocused, expectCount, fill, openWorkspace, press, role, start, stop, textOf, visible,
  typeText, uploadFile, value, waitFor,
} from "../support/harness.mjs";
import { canvasNoteIds, createNoteOnCanvas, visualBox, waitSaved } from "./note-helpers.mjs";

before(start);
after(stop);

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
    const richDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Rich heading" }] },
        { type: "bulletList", content: ["first item", "second item"].map((text) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " external", marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }] },
          ],
        },
      ],
    };
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
    await click(role("button", "More canvas actions", { scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Zoom in", { scope: role("dialog", "Canvas options") }));
    await click(role("button", "More canvas actions", { scope: role("toolbar", "Canvas view controls") }));
    await click(role("button", "Zoom in", { scope: role("dialog", "Canvas options") }));
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

test("advanced rich content supports image upload, math validation recovery, tables, and callouts", { timeout: 180_000 }, async () => {
  const workspace = await createWorkspace(`Canvas Note Rich ${Date.now()}`);
  const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
  try {
    await openWorkspace(workspace.id);
    const noteId = await createNoteOnCanvas(workspace.id);
    const editor = "[data-note-element] .ProseMirror";

    await uploadFile('input[aria-label="Insert image"]', {
      name: "diagram.png",
      mimeType: "image/png",
      buffer: tinyPng,
    });
    await visible('[data-note-element] img[src*="/assets/"]');

    await expectFocused(editor);
    await press("Enter");
    await typeText("/math");
    await press("Enter");
    const mathDialog = role("dialog", "Insert Math formula");
    await visible(mathDialog);
    await fill('input[aria-label="LaTeX formula"]', "\\frac{1");
    await click(role("button", "Insert", { scope: mathDialog }));
    await visible('[role="dialog"][aria-label="Insert Math formula"] [role="alert"]');
    assert.ok(!JSON.stringify((await api(`/api/notes/${noteId}`)).document).includes("frac"), "Invalid LaTeX error leaves stored Note unchanged");

    await fill('input[aria-label="LaTeX formula"]', "a^2 + b^2 = c^2");
    await click(role("button", "Block", { scope: mathDialog }));
    await click(role("button", "Insert", { scope: mathDialog }));
    await waitFor(async () => JSON.stringify((await api(`/api/notes/${noteId}`)).document).includes("a^2 + b^2 = c^2"), "Valid math block saves to Note");

    await expectFocused(editor);
    await press("Enter");
    await typeText("/table");
    await press("Enter");
    await visible("[data-note-element] table");
    await typeText("Header 1");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await click('[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]');
    await visible(editor);
    await typeText("/callout");
    await press("Enter");
    await typeText("Important callout reminder");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await openWorkspace(workspace.id);
    await visible('[data-note-element] [data-note-read-view] img[src*="/assets/"]');
    await visible('[data-note-element] [data-note-read-view] .notespace-note-math[data-latex="a^2 + b^2 = c^2"] .katex');
    await containsText("[data-note-element] [data-note-read-view] table", "Header 1");
    await containsText('[data-note-element] [data-note-read-view] aside[data-note-callout="note"]', "Important callout reminder");
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
    const editor = `${card} .ProseMirror`;
    await fill(editor, "Foldable headline\nSecond body line\nThird body line");
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    const unfoldedBox = await visualBox(card);
    assert.ok(unfoldedBox.height >= 170, `Unfolded height starts at normal card height (got ${unfoldedBox.height})`);

    const noteActions = role("toolbar", "Canvas Note actions");
    await click(role("button", "Fold", { scope: noteActions }));
    await visible(`${card}[data-note-compact="true"]`);
    await waitFor(async () => Math.abs((await visualBox(card)).height - 48) < 4, "Folded card collapses to 48px");
    await visible(role("button", "Unfold", { scope: noteActions }));
    await waitSaved();

    const storedFolded = await api(`/api/workspaces/${workspace.id}`);
    const foldedEl = (storedFolded.canvas.data.elements ?? []).find((candidate) => !candidate.isDeleted && candidate.customData?.notespaceNote);
    assert.equal(foldedEl?.customData?.notespaceNote?.compact, true);
    assert.equal(Math.round(foldedEl?.height ?? 0), 48);

    await click(role("button", "Unfold", { scope: noteActions }));
    await visible(`${card}:not([data-note-compact="true"])`);
    await waitFor(async () => (await visualBox(card)).height >= 170, "Unfolding restores original card height");

    const currentBox = await visualBox(card);
    await clickAt(currentBox.x + currentBox.width / 2, currentBox.y + currentBox.height / 2);
    await press("Control+Alt+Enter");
    await visible(`${card}[data-note-compact="true"]`);
    await press("Control+Alt+Enter");
    await visible(`${card}:not([data-note-compact="true"])`);

    await click(role("button", "More", { scope: noteActions }));
    await click(role("button", "Card color blue"));
    await visible(`${card}[data-note-color="blue"]`);
    await waitSaved();

    await click(role("button", "More", { scope: noteActions }));
    await click(role("button", "Card shape square"));
    await visible(`${card}[data-note-shape="square"]`);
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
    const editor = `${card} .ProseMirror`;
    await expectFocused(editor);
    await typeText("/checklist");
    await press("Enter");
    await typeText("Read-mode task");
    await press("Enter");
    await press("Enter");
    await typeText("/toggle");
    await press("Enter");
    await typeText("Toggle summary");
    await press("Enter");
    await typeText("Toggle hidden body");
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
    const savedDoc = JSON.stringify((await api(`/api/notes/${noteId}`)).document);
    assert.match(savedDoc, /"checked":true/);
    assert.match(savedDoc, /"open":false/);

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

test("Note formatting supports highlight, text color, toggle, table Row-/Col-, click-to-edit math, and @/[[ Create & link", { timeout: 180_000 }, async () => {
  const token = `Rich${Date.now()}`;
  const workspace = await createWorkspace(`Canvas Note Formatting ${token}`);
  try {
    await openWorkspace(workspace.id);
    await createNoteOnCanvas(workspace.id);
    const card = "[data-note-element]";
    const editor = `${card} .ProseMirror`;
    const targetTitle = `AlphaTarget ${token}`;
    await fill(editor, targetTitle);
    await waitSaved();
    await press("Escape");
    await expectCount(editor, 0);

    await click('[role="toolbar"][aria-label="Canvas tools"] button[aria-label="Note"]');
    await visible(editor);
    await expectFocused(editor);

    await typeText("HighlightWord");
    await press("Shift+Home");
    const formattingToolbar = role("toolbar", "Note formatting");
    await visible(formattingToolbar);
    await click(role("button", "Highlight", { scope: formattingToolbar }));
    await click(role("button", "Highlight yellow", { scope: formattingToolbar }));
    await visible(`${card} mark[data-note-highlight="yellow"]`);

    await press("ArrowRight");
    await press("Enter");
    await typeText("ColoredWord");
    await press("Shift+Home");
    await visible(formattingToolbar);
    await click(role("button", "Text color", { scope: formattingToolbar }));
    await click(role("button", "Text color blue", { scope: formattingToolbar }));
    await visible(`${card} span[data-note-text-color="blue"]`);

    await press("ArrowRight");
    await press("Enter");
    await typeText("/math");
    await press("Enter");
    const insertMath = role("dialog", "Insert Math formula");
    await visible(insertMath);
    await fill(ariaLabel("LaTeX formula"), "x^2");
    await click(role("button", "Insert", { scope: insertMath }));
    await visible(`${card} .tiptap-mathematics-render[data-latex="x^2"]`);

    await click(`${card} .tiptap-mathematics-render[data-latex="x^2"]`);
    const editMath = role("dialog", "Edit Math formula");
    await visible(editMath);
    assert.equal(await value(ariaLabel("LaTeX formula")), "x^2");
    await fill(ariaLabel("LaTeX formula"), "y^3");
    await click(role("button", "Update", { scope: editMath }));
    await visible(`${card} .tiptap-mathematics-render[data-latex="y^3"]`);

    await press("End");
    await press("Enter");
    await typeText("See @AlphaTarget");
    const refList = role("listbox", "Canvas Note references");
    await visible(role("button", new RegExp(targetTitle), { scope: refList }));
    await press("Enter");
    await containsText(editor, targetTitle);

    const freshTitle = `FreshIdea ${token}`;
    await typeText(` and [[${freshTitle}`);
    const createAndLinkBtn = role("button", `Create & link "${freshTitle}"`, { scope: refList });
    await visible(createAndLinkBtn);
    await click(createAndLinkBtn);
    await expectCount(card, 3);

    await press("Enter");
    await typeText("/toggle");
    await press("Enter");
    await visible(`${card} div[data-note-toggle]`);
    await typeText("Toggle title");
    await press("Enter");
    await typeText("Toggle content");

    await click(`${card} .notespace-note-toggle-trigger`);
    await visible(`${card} div[data-note-toggle][data-open="false"]`);
    await visible(`${card} [data-note-toggle-summary]`);
    await containsText(`${card} [data-note-toggle-summary]`, "Toggle title");
    assert.ok(!(await textOf(`${card} div[data-note-toggle]`)).includes("Toggle content"), "Collapsed edit-mode toggle hides body while keeping summary visible");
    await click(`${card} .notespace-note-toggle-trigger`);
    await visible(`${card} div[data-note-toggle][data-open="true"]`);
    await containsText(`${card} div[data-note-toggle]`, "Toggle content");

    await press("Enter");
    await typeText("/table");
    await press("Enter");
    await visible(`${card} table`);
    await expectCount(`${card} table tr`, 2);
    await click(ariaLabel("Add table row"));
    await expectCount(`${card} table tr`, 3);
    await click(ariaLabel("Delete table row"));
    await expectCount(`${card} table tr`, 2);
    await click(ariaLabel("Add table column"));
    await expectCount(`${card} table tr:first-child th, ${card} table tr:first-child td`, 3);
    await click(ariaLabel("Delete table column"));
    await expectCount(`${card} table tr:first-child th, ${card} table tr:first-child td`, 2);

    await waitSaved();
    await openWorkspace(workspace.id);
    await expectCount(card, 3);
    await visible(`${card} [data-note-read-view] mark[data-note-highlight="yellow"]`);
    await visible(`${card} [data-note-read-view] span[data-note-text-color="blue"]`);
    await visible(`${card} [data-note-read-view] div[data-note-toggle]`);
    await visible(`${card} [data-note-read-view] .notespace-note-math[data-latex="y^3"] .katex`);
  } finally {
    await cleanupWorkspace(workspace.id);
  }
});
