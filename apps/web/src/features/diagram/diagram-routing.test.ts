import assert from "node:assert/strict";
import test from "node:test";
import type { StructuredDiagram } from "./diagram-model.ts";
import { diagramGroupBounds, routeStructuredDiagram } from "./diagram-routing.ts";

function node(id: string, x: number, y: number) {
  return {
    id,
    specKey: "server",
    label: id,
    elementId: `shape-${id}`,
    x,
    y,
    width: 56,
    height: 56,
    renderMode: "icon" as const,
  };
}

function diagram(nodes: StructuredDiagram["nodes"]): StructuredDiagram {
  return {
    id: "diagram-1",
    kind: "architecture",
    title: "Routing",
    nodes,
    edges: [{ id: "edge-1", from: "source", to: "target", label: "", elementId: "arrow-1" }],
    groups: [],
  };
}

test("Eraser router produces an orthogonal route around an intervening node", () => {
  const input = diagram([
    node("source", 0, 120),
    node("blocker", 180, 120),
    node("target", 360, 120),
  ]);

  const route = routeStructuredDiagram(input).get("edge-1");
  assert(route, "expected a routed connection");
  assert(route.points.length >= 3, "obstacle route should have at least one bend");

  const absolute = route.points.map(([x, y]) => [route.x + x, route.y + y] as const);
  for (let index = 1; index < absolute.length; index += 1) {
    const [previousX, previousY] = absolute[index - 1];
    const [x, y] = absolute[index];
    assert(previousX === x || previousY === y, "corridor route must stay orthogonal");
  }
  assert(new Set(absolute.map(([, y]) => y)).size > 1, "route should leave the blocked horizontal corridor");
});

test("diagram groups expose stable container bounds for routing and rendering", () => {
  const source = { ...node("source", 100, 80), groupId: "group-1" };
  const target = { ...node("target", 260, 160), groupId: "group-1" };
  const input: StructuredDiagram = {
    ...diagram([source, target]),
    groups: [{ id: "group-1", label: "Private tier", elementId: "group-shape-1", nodeIds: [source.id, target.id] }],
  };

  assert.deepEqual(diagramGroupBounds(input, [source.id, target.id]), {
    x: 72,
    y: 52,
    width: 272,
    height: 192,
  });
  assert(routeStructuredDiagram(input).has("edge-1"));
});
