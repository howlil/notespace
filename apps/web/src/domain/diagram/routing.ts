import {
  LayoutManager,
  routeCorridorConnectionBatch,
  type LayoutEntity,
  type NewConnection,
} from "@eraserlabs/layout";
import type { StructuredDiagram } from "./diagram";

const GROUP_PADDING = 28;
const GROUP_PREFIX = "notespace-group:";

export interface DiagramRoute {
  edgeId: string;
  x: number;
  y: number;
  points: [number, number][];
}

export function diagramGroupBounds(diagram: StructuredDiagram, nodeIds: readonly string[]) {
  const nodes = diagram.nodes.filter((node) => nodeIds.includes(node.id));
  if (!nodes.length) return null;
  const left = Math.min(...nodes.map((node) => node.x)) - GROUP_PADDING;
  const top = Math.min(...nodes.map((node) => node.y)) - GROUP_PADDING;
  const right = Math.max(...nodes.map((node) => node.x + node.width)) + GROUP_PADDING;
  const bottom = Math.max(...nodes.map((node) => node.y + node.height)) + GROUP_PADDING;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function groupLayoutId(groupId: string) {
  return `${GROUP_PREFIX}${groupId}`;
}

function layoutEntities(diagram: StructuredDiagram): LayoutEntity[] {
  const groups: LayoutEntity[] = diagram.groups.flatMap((group) => {
    const bounds = diagramGroupBounds(diagram, group.nodeIds);
    if (!bounds) return [];
    return [{
      id: groupLayoutId(group.id),
      ...bounds,
      isContainer: true,
      options: { sizingMode: "manual" },
    }];
  });

  const validGroupIds = new Set(diagram.groups.map((group) => group.id));
  const nodes: LayoutEntity[] = diagram.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    containerId: node.groupId && validGroupIds.has(node.groupId)
      ? groupLayoutId(node.groupId)
      : undefined,
    ...(node.renderMode === "icon"
      ? {
          textPlacement: {
            relativeX: -16,
            relativeY: node.height + 8,
            width: node.width + 32,
            height: 18,
          },
        }
      : {}),
  }));

  return [...groups, ...nodes];
}

export function routeStructuredDiagram(diagram: StructuredDiagram) {
  const routes = new Map<string, DiagramRoute>();
  if (!diagram.edges.length || diagram.nodes.length < 2) return routes;

  const connections: NewConnection[] = diagram.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
  }));

  try {
    const layoutManager = new LayoutManager({
      entities: layoutEntities(diagram),
      connections: [],
      primaryDirection: diagram.kind === "flowchart" ? "down" : "right",
    });

    routeCorridorConnectionBatch({
      layoutManager,
      connectionsToRoute: connections,
    });

    for (const edge of diagram.edges) {
      const connection = layoutManager.getConnectionById(edge.id);
      if (!connection || connection.points.length < 2) continue;
      const points = connection.points.map((point) => [point[0], point[1]] as [number, number]);
      if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) continue;
      routes.set(edge.id, {
        edgeId: edge.id,
        x: connection.x,
        y: connection.y,
        points,
      });
    }
  } catch {
    // Routing is an enhancement. Native Excalidraw bindings remain the escape
    // hatch if the external router cannot handle a malformed or transient graph.
  }

  return routes;
}
