import {
  getCatalogItem,
  makeDiagramId,
  type IdFactory,
  type StructuredDiagram,
} from "../../features/diagram/diagram-model.ts";

export type DirectionalSpawnDirection = "left" | "right" | "up" | "down";

type Box = { x: number; y: number; width: number; height: number };

export function keyFromDirection(direction: DirectionalSpawnDirection) {
  if (direction === "left") return "ArrowLeft";
  if (direction === "right") return "ArrowRight";
  if (direction === "up") return "ArrowUp";
  return "ArrowDown";
}

export const DIRECTIONAL_SPAWN_GAP = 120;

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

type NativeShapeSource = Box & {
  id: string;
  type: string;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  roundness?: unknown;
};

const nativeShapeTypes = new Set(["rectangle", "ellipse", "diamond"]);

export function isNativeFlowchartShapeType(type: string) {
  return nativeShapeTypes.has(type);
}

export function nativeDirectionalSpawnPlan(
  source: NativeShapeSource,
  direction: DirectionalSpawnDirection,
  gap = DIRECTIONAL_SPAWN_GAP,
  idFactory: IdFactory = makeDiagramId,
) {
  if (!nativeShapeTypes.has(source.type)) return null;
  const position = directionalSpawnPosition(source, direction, gap);
  const shapeId = idFactory("shape");
  const arrowId = idFactory("arrow");
  const shape = {
    type: source.type,
    id: shapeId,
    ...position,
    width: source.width,
    height: source.height,
    strokeColor: source.strokeColor,
    backgroundColor: source.backgroundColor,
    fillStyle: source.fillStyle,
    strokeWidth: source.strokeWidth,
    strokeStyle: source.strokeStyle,
    roughness: source.roughness,
    opacity: source.opacity,
    ...(source.roundness ? { roundness: source.roundness } : {}),
  };
  const arrow = {
    type: "arrow",
    id: arrowId,
    x: 0,
    y: 0,
    strokeColor: source.strokeColor,
    strokeWidth: source.strokeWidth,
    strokeStyle: "solid",
    roughness: source.roughness,
    opacity: source.opacity,
    endArrowhead: "arrow",
    start: { id: source.id },
    end: { id: shapeId },
  };
  return { shapeId, arrowId, skeletons: [shape, arrow] };
}
