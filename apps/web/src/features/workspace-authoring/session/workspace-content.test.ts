import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceContent } from "../../../domain/workspace/workspace";
import { normalizeWorkspaceContent } from "./workspace-content.ts";

function content(): WorkspaceContent {
  return {
    title: "Workspace",
    document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } },
    notes: [{ id: "legacy-note", title: "Retired", document: { format: "tiptap", version: 1, data: { type: "doc", content: [] } }, createdAt: "", updatedAt: "", version: 1 }],
    canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
    references: [{ id: "legacy", blockId: "block", elementId: "element" }],
    splitRatio: 0.5,
  };
}

test("Canvas-only normalization removes retired authored collections", () => {
  const normalized = normalizeWorkspaceContent(content());
  assert.equal(normalized.changed, true);
  assert.deepEqual(normalized.content.notes, []);
  assert.deepEqual(normalized.content.references, []);
  assert.deepEqual(normalized.content.canvas.data.elements, []);
});

test("Canvas-only normalization does not rewrite the Canvas snapshot", () => {
  const source = content();
  source.notes = [];
  source.references = [];
  const normalized = normalizeWorkspaceContent(source);
  assert.equal(normalized.changed, false);
  assert.equal(normalized.content.canvas, source.canvas);
});
