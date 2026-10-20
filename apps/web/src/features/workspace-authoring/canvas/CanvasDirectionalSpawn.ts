import {
  getCatalogItem,
  makeDiagramId,
  type IdFactory,
  type StructuredDiagram,
} from "../../../domain/diagram/diagram.ts";

export type DirectionalSpawnDirection = "left" | "right" | "up" | "down";

type Box = { x: number; y: number; width: number; height: number };

export function keyFromDirection(direction: DirectionalSpawnDirection) {
  if (direction === "left") return "ArrowLeft";
  if (direction === "right") return "ArrowRight";
  if (direction === "up") return "ArrowUp";
  return "ArrowDown";
}

export const DIRECTIONAL_SPAWN_GAP = 120;

/** Select at most one directional control based on pointer proximity to a shape edge. */
export type FlowchartHandleBounds = { left: number; top: number; right: number; bottom: number };
export const FLOWCHART_HANDLE_HOVER_DISTANCE = 32;

export function hoveredFlowchartDirection(
  bounds: FlowchartHandleBounds,
  clientX: number,
  clientY: number,
  previous: DirectionalSpawnDirection | null = null,
  threshold = FLOWCHART_HANDLE_HOVER_DISTANCE,
): DirectionalSpawnDirection | null {
  const { left, right, top, bottom } = bounds;
  if (![left, right, top, bottom, clientX, clientY].every(Number.isFinite) || left >= right || top >= bottom) return null;
  const x = Math.min(right, Math.max(left, clientX));
  const y = Math.min(bottom, Math.max(top, clientY));
  const distances: Record<DirectionalSpawnDirection, number> = {
    up: Math.hypot(clientX - x, clientY - top),
    right: Math.hypot(clientX - right, clientY - y),
    down: Math.hypot(clientX - x, clientY - bottom),
    left: Math.hypot(clientX - left, clientY - y),
  };
  const nearest = (["up", "right", "down", "left"] as const).reduce(
    (best, direction) => distances[direction] < distances[best] ? direction : best,
    "up" as DirectionalSpawnDirection,
  );
  if (distances[nearest] > threshold) return null;
  // Preserve the current side near corners instead of flickering on pixel-level changes.
  if (previous && distances[previous] <= threshold && distances[previous] <= distances[nearest] + 5) return previous;
  return nearest;
}

export function directionFromKey(key: string): DirectionalSpawnDirection | null {
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  return null;
}

export function directionalSpawnPosition(
  source: Box,
  direction: DirectionalSpawnDirection,
  gap = DIRECTIONAL_SPAWN_GAP,
) {
  if (direction === "left") return { x: source.x - source.width - gap, y: source.y };
  if (direction === "right") return { x: source.x + source.width + gap, y: source.y };
  if (direction === "up") return { x: source.x, y: source.y - source.height - gap };
  return { x: source.x, y: source.y + source.height + gap };
}

export function spawnConnectedStructuredNode(
  diagram: StructuredDiagram,
  sourceNodeId: string,
  direction: DirectionalSpawnDirection,
  gap = DIRECTIONAL_SPAWN_GAP,
  idFactory: IdFactory = makeDiagramId,
) {
  const source = diagram.nodes.find((node) => node.id === sourceNodeId);
  if (!source) return null;

  const item = getCatalogItem(source.specKey);
  const position = directionalSpawnPosition(source, direction, gap);
  const nodeId = idFactory("node");
  const node = {
    ...source,
    id: nodeId,
    elementId: idFactory("shape"),
    label: item.label,
    x: position.x,
    y: position.y,
  };
  const edge = {
    id: idFactory("edge"),
    from: source.id,
    to: node.id,
    label: "",
    elementId: idFactory("arrow"),
  };
  const groups = source.groupId
    ? diagram.groups.map((group) => group.id === source.groupId
      ? { ...group, nodeIds: [...group.nodeIds, node.id] }
      : group)
    : diagram.groups;

  return {
    diagram: {
      ...diagram,
      nodes: [...diagram.nodes, node],
      edges: [...diagram.edges, edge],
      groups,
    },
    nodeId,
    edgeId: edge.id,
  };
}

const nativeShapeTypes = new Set(["rectangle", "ellipse", "diamond"]);

export function isNativeFlowchartShapeType(type: string) {
  return nativeShapeTypes.has(type);
}
