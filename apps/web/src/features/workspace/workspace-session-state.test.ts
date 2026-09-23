import assert from "node:assert/strict";
import test from "node:test";
import type { Note, WorkspaceContent, Snapshot } from "../../domain/workspace/workspace";
import { acknowledgeNoteVersion, applyCanvasSnapshot, applyNoteDocument } from "./workspace-session-state";

const documentA: Snapshot = { format: "tiptap", version: 1, data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] } };
const documentB: Snapshot = { format: "tiptap", version: 1, data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] } };
const canvasA: Snapshot = { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } };
const canvasB: Snapshot = { format: "excalidraw", version: 1, data: { elements: [{ id: "shape-1" }], appState: {}, files: {} } };

function content(): WorkspaceContent {
  const note: Note = {
    id: "note-1",
    title: "Draft",
    document: documentA,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 2,
  };
  return {
    title: "Workspace",
    document: documentA,
    notes: [note],
    canvas: canvasA,
    references: [],
    splitRatio: 0.5,
  };
}

test("stale note acknowledgement advances version without replacing newer authored fields", () => {
  const local = applyNoteDocument(content(), "note-1", documentB, "2026-01-02T00:00:00Z");
  assert.ok(local);
  const staleServerNote: Note = {
    ...local.note,
    title: "Older server title",
    document: documentA,
    version: 3,
  };

  const acknowledged = acknowledgeNoteVersion(local.content, staleServerNote);
  assert.equal(acknowledged.notes[0].version, 3);
  assert.equal(acknowledged.notes[0].title, "Draft");
  assert.deepEqual(acknowledged.notes[0].document, documentB);
});

test("note document transition updates the compatibility document and the targeted note only", () => {
  const result = applyNoteDocument(content(), "note-1", documentB, "2026-01-02T00:00:00Z");
  assert.ok(result);
  assert.deepEqual(result.content.document, documentB);
  assert.deepEqual(result.note.document, documentB);
  assert.equal(result.note.updatedAt, "2026-01-02T00:00:00Z");
});

test("canvas transition changes only the authored canvas", () => {
  const before = content();
  const after = applyCanvasSnapshot(before, canvasB);
  assert.deepEqual(after.canvas, canvasB);
  assert.equal(after.notes, before.notes);
});
