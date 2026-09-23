import type { DiagramSelection, StructuredDiagram } from "../../../domain/diagram/diagram";

export function sameDiagramSelection(left: DiagramSelection, right: DiagramSelection) {
  return left.diagramId === right.diagramId
    && left.edgeId === right.edgeId
    && left.groupId === right.groupId
    && left.nodeIds.length === right.nodeIds.length
    && left.nodeIds.every((nodeId, index) => nodeId === right.nodeIds[index]);
}

export function sameStructuredDiagrams(left: readonly StructuredDiagram[], right: readonly StructuredDiagram[]) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeById<T extends { id: string }>(history: readonly T[], current: readonly T[]) {
  const merged = new Map(history.map((item) => [item.id, item]));
  for (const item of current) merged.set(item.id, item);
  return [...merged.values()];
}

// Excalidraw owns the visual undo stack, while structured diagram metadata is
// persisted separately. Keep a session-only superset of known identities so
// an undo/redo that restores native elements can reconstruct graph metadata.
export function mergeDiagramHistory(history: readonly StructuredDiagram[], current: readonly StructuredDiagram[]) {
  const merged = new Map(history.map((diagram) => [diagram.id, diagram]));
  for (const diagram of current) {
    const previous = merged.get(diagram.id);
    merged.set(diagram.id, previous ? {
      ...diagram,
      nodes: mergeById(previous.nodes, diagram.nodes),
      edges: mergeById(previous.edges, diagram.edges),
      groups: mergeById(previous.groups, diagram.groups),
    } : diagram);
  }
  return [...merged.values()];
}

export function forgetDiagramHistory(history: readonly StructuredDiagram[], diagramId: string) {
  return history.filter((diagram) => diagram.id !== diagramId);
}
