import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramSelection, StructuredDiagram } from "../../features/diagram/diagram-model";
import { forgetDiagramHistory, mergeDiagramHistory, sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state.ts";

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
