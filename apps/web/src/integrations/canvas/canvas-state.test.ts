import assert from "node:assert/strict";
import test from "node:test";
import type { StructuredDiagram } from "../../features/diagram/diagram-model";
import { sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state.ts";

test("diagram selection equality rejects only observable selection changes", () => {
  const empty = { diagramId: null, nodeIds: [] };
  assert.equal(sameDiagramSelection(empty, { diagramId: null, nodeIds: [] }), true);
  assert.equal(sameDiagramSelection({ diagramId: "diagram-1", nodeIds: ["a", "b"] }, { diagramId: "diagram-1", nodeIds: ["a", "b"] }), true);
  assert.equal(sameDiagramSelection({ diagramId: "diagram-1", nodeIds: ["a", "b"] }, { diagramId: "diagram-1", nodeIds: ["b", "a"] }), false);
  assert.equal(sameDiagramSelection({ diagramId: "diagram-1", nodeIds: ["a"] }, { diagramId: "diagram-2", nodeIds: ["a"] }), false);
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
