import type { DiagramSelection, StructuredDiagram } from "../../features/diagram/diagram-model";

export function sameDiagramSelection(left: DiagramSelection, right: DiagramSelection) {
  return left.diagramId === right.diagramId
    && left.nodeIds.length === right.nodeIds.length
    && left.nodeIds.every((nodeId, index) => nodeId === right.nodeIds[index]);
}

export function sameStructuredDiagrams(left: readonly StructuredDiagram[], right: readonly StructuredDiagram[]) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}
