import assert from "node:assert/strict";
import test from "node:test";
import type { DiagramSelection, StructuredDiagram } from "../../features/diagram/diagram-model";
import { sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state.ts";

function selection(overrides: Partial<DiagramSelection> = {}): DiagramSelection {
  return { diagramId: null, nodeIds: [], edgeId: null, groupId: null, ...overrides };
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
  const diagram: StructuredDiagram = {
    id: "diagram-1",
    kind: "architecture",
    title: "Architecture diagram",
    nodes: [],
    edges: [],
    groups: [],
  };
  assert.equal(sameStructuredDiagrams([diagram], [diagram]), true);
  assert.equal(sameStructuredDiagrams([diagram], [{ ...diagram }]), true);
  assert.equal(sameStructuredDiagrams([diagram], [{ ...diagram, title: "Changed" }]), false);
});
