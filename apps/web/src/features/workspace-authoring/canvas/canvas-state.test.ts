import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramSelection, StructuredDiagram } from "../../../domain/diagram/diagram";
import { forgetDiagramHistory, mergeDiagramHistory, sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state.ts";
import { findCanvasNoteArtifactId, notePreviewText, readCanvasNoteArtifact, withCanvasNoteArtifact } from "./canvas-note-artifact.ts";

function selection(overrides: Partial<DiagramSelection> = {}): DiagramSelection {
  return { diagramId: null, nodeIds: [], edgeId: null, groupId: null, ...overrides };
}

function diagram(): StructuredDiagram {
  return {
    id: "diagram-1",
    kind: "architecture",
    title: "Architecture diagram",
    nodes: [
      { id: "node-a", specKey: "browser", label: "Browser", elementId: "shape-a", x: 0, y: 0, width: 56, height: 56 },
      { id: "node-b", specKey: "server", label: "Server", elementId: "shape-b", x: 200, y: 0, width: 56, height: 56 },
    ],
    edges: [{ id: "edge-1", from: "node-a", to: "node-b", label: "HTTPS", elementId: "arrow-1" }],
    groups: [{ id: "group-1", label: "Public tier", elementId: "group-shape-1", nodeIds: ["node-a", "node-b"] }],
  };
}

test("diagram selection equality rejects only observable selection changes", () => {
  assert.equal(sameDiagramSelection(selection(), selection()), true);
  assert.equal(sameDiagramSelection(selection({ diagramId: "diagram-1", nodeIds: ["a", "b"] }), selection({ diagramId: "diagram-1", nodeIds: ["a", "b"] })), true);
  assert.equal(sameDiagramSelection(selection({ diagramId: "diagram-1", nodeIds: ["a", "b"] }), selection({ diagramId: "diagram-1", nodeIds: ["b", "a"] })), false);
  assert.equal(sameDiagramSelection(selection({ diagramId: "diagram-1", nodeIds: ["a"] }), selection({ diagramId: "diagram-2", nodeIds: ["a"] })), false);
  assert.equal(sameDiagramSelection(selection({ diagramId: "diagram-1", edgeId: "edge-1" }), selection({ diagramId: "diagram-1", edgeId: "edge-2" })), false);
  assert.equal(sameDiagramSelection(selection({ diagramId: "diagram-1", groupId: "group-1" }), selection({ diagramId: "diagram-1", groupId: "group-2" })), false);
});

test("structured diagram equality suppresses equivalent editor emissions", () => {
  const value = diagram();
  assert.equal(sameStructuredDiagrams([value], [value]), true);
  assert.equal(sameStructuredDiagrams([value], [{ ...value }]), true);
  assert.equal(sameStructuredDiagrams([value], [{ ...value, title: "Changed" }]), false);
});

test("diagram history keeps removed identities available for native undo", () => {
  const original = diagram();
  const afterDelete = { ...original, edges: [], groups: [] };
  const history = mergeDiagramHistory([original], [afterDelete]);
  assert.equal(history[0].edges[0].id, "edge-1");
  assert.equal(history[0].groups[0].id, "group-1");

  const moved = { ...afterDelete, nodes: afterDelete.nodes.map((node) => node.id === "node-a" ? { ...node, x: 80 } : node) };
  const nextHistory = mergeDiagramHistory(history, [moved]);
  assert.equal(nextHistory[0].nodes.find((node) => node.id === "node-a")?.x, 80);
  assert.equal(nextHistory[0].edges[0].id, "edge-1");
});

test("detaching a diagram removes its undo identity archive", () => {
  assert.deepEqual(forgetDiagramHistory([diagram()], "diagram-1"), []);
});


test("linked note metadata round-trips without copying authored note content", () => {
  const customData = withCanvasNoteArtifact({ existing: "kept" }, {
    version: 1,
    noteId: "note-1",
    displayMode: "preview",
  });
  assert.equal((customData as Record<string, unknown>).existing, "kept");
  assert.deepEqual(readCanvasNoteArtifact({ customData }), {
    version: 1,
    noteId: "note-1",
    displayMode: "preview",
  });
  assert.equal("title" in (customData.notespaceNoteArtifact as Record<string, unknown>), false);
  assert.equal("content" in (customData.notespaceNoteArtifact as Record<string, unknown>), false);
});

test("canvas note backlink resolves only live matching artifacts", () => {
  const snapshot = {
    format: "excalidraw",
    version: 1,
    data: {
      elements: [
        { id: "deleted", isDeleted: true, customData: withCanvasNoteArtifact(undefined, { version: 1, noteId: "note-1", displayMode: "preview" }) },
        { id: "other", customData: withCanvasNoteArtifact(undefined, { version: 1, noteId: "note-2", displayMode: "preview" }) },
        { id: "target", customData: withCanvasNoteArtifact(undefined, { version: 1, noteId: "note-1", displayMode: "compact" }) },
      ],
      appState: {},
      files: {},
    },
  };
  assert.equal(findCanvasNoteArtifactId(snapshot, "note-1"), "target");
  assert.equal(findCanvasNoteArtifactId(snapshot, "missing"), null);
});

test("linked note preview is derived from the current document and bounded", () => {
  const note = {
    document: {
      format: "tiptap",
      version: 1,
      data: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Redis is a cache." }] },
          { type: "paragraph", content: [{ type: "text", text: "Postgres remains the source of truth." }] },
        ],
      },
    },
  };
  assert.equal(notePreviewText(note, 80), "Redis is a cache. Postgres remains the source of truth.");
  assert.equal(notePreviewText(note, 24), "Redis is a cache. Postg…");
});
