import assert from "node:assert/strict";
import test from "node:test";
import { workspaceContentOf, type Snapshot, type Workspace } from "./workspace.ts";

function document(text = "hello"): Snapshot {
  return {
    format: "tiptap",
    version: 1,
    data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  };
}

function workspace(): Workspace {
  const doc = document();
  return {
    id: "workspace-1",
    categoryId: "category-1",
    title: "Workspace",
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T01:00:00Z",
    version: 4,
    document: doc,
    notes: [{
      id: "note-1",
      title: "Note",
      document: doc,
      createdAt: "2026-09-25T00:00:00Z",
      updatedAt: "2026-09-25T01:00:00Z",
      version: 3,
    }],
    canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
    canvasVersion: 2,
    references: [],
    splitRatio: 0.45,
  };
}

test("workspaceContentOf preserves Canvas content without mutation", () => {
  const source = workspace();
  const before = structuredClone(source);
  const content = workspaceContentOf(source);

  assert.equal(content.title, source.title);
  assert.deepEqual(content.notes, []);
  assert.equal(content.document, source.document);
  assert.equal(content.canvas, source.canvas);
  assert.deepEqual(source, before);
});

test("workspaceContentOf does not synthesize a legacy Note", () => {
  const source = workspace();
  source.notes = [];

  const content = workspaceContentOf(source);

  assert.deepEqual(content.notes, []);
  assert.equal(source.notes.length, 0);
});
