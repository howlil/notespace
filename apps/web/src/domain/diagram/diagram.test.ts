import assert from "node:assert/strict";
import test from "node:test";
import { directionalSpawnPosition, spawnConnectedStructuredNode } from "../../features/workspace-authoring/canvas/CanvasDirectionalSpawn.ts";
import {
  addCatalogNode,
  connectDiagramNodes,
  createDiagramWithNode,
  diagramNodeLabelElementId,
  diagramPickerIconCount,
  getCatalogItem,
  groupDiagramNodes,
  hydrateDiagramGeometryFromElements,
  layoutDiagram,
  readStructuredDiagrams,
  removeDiagramEdge,
  renameDiagramEdge,
  renameDiagramGroup,
  renameDiagramNode,
  searchDiagramCatalog,
  searchEraserCatalog,
  selectionForElements,
  syncDiagramsFromElements,
  ungroupDiagramNodes,
  withStructuredDiagrams,
} from "./diagram.ts";

function ids() {
  let value = 0;
  return (prefix: string) => `${prefix}-${++value}`;
}

function threeNodeDiagram(kind: "architecture" | "flowchart", nextId = ids()) {
  let diagram = createDiagramWithNode(kind, getCatalogItem(kind === "architecture" ? "browser" : "start"), { x: 0, y: 0 }, nextId);
  diagram = addCatalogNode(diagram, getCatalogItem(kind === "architecture" ? "server" : "process"), { x: 200, y: 0 }, nextId);
  diagram = connectDiagramNodes(diagram, diagram.nodes[0].id, diagram.nodes[1].id, nextId);
  diagram = addCatalogNode(diagram, getCatalogItem(kind === "architecture" ? "postgresql" : "decision"), { x: 400, y: 0 }, nextId);
  diagram = connectDiagramNodes(diagram, diagram.nodes[1].id, diagram.nodes[2].id, nextId);
  return layoutDiagram(diagram, { x: 0, y: 0 });
}

test("catalog search supports provider categories and keywords", () => {
  assert(searchEraserCatalog("postgres").some((item) => item.key === "postgres"));
  assert(searchDiagramCatalog("storage", "aws").some((item) => item.key === "aws-s3"));
  assert(searchDiagramCatalog("function", "azure").some((item) => item.key === "azure-functions"));
});

test("picker catalog exposes system-design components instead of generic UI actions", () => {
  assert.equal(diagramPickerIconCount, searchEraserCatalog("").length);
  assert.equal(searchEraserCatalog("", "general").length, 8);
  assert.equal(searchEraserCatalog("align left").length, 0);
  assert.equal(searchEraserCatalog("align end horizontal").length, 0);
  assert.equal(searchEraserCatalog("lambda")[0]?.key, "aws-lambda");
  assert.equal(searchEraserCatalog("cloud run", "gcp")[0]?.key, "gcp-cloud-run");
  assert(searchEraserCatalog("database", "general").some((item) => item.key === "database"));
});

test("new insertion is icon-only while old component snapshots remain readable", () => {
  const diagram = createDiagramWithNode("architecture", getCatalogItem("aws-lambda"), { x: 10, y: 20 }, ids());
  assert.equal(diagram.nodes[0].renderMode, "icon");
  assert.equal(diagram.nodes[0].width, 56);
  assert.equal(diagram.nodes[0].height, 56);

  const legacy = {
    ...diagram,
    nodes: [{ ...diagram.nodes[0], renderMode: "component" as const, width: 164, height: 72 }],
  };
  assert.equal(readStructuredDiagrams(withStructuredDiagrams({}, [legacy]))[0].nodes[0].renderMode, "component");
});

test("architecture and flow layout keep their historical orientation", () => {
  const architecture = threeNodeDiagram("architecture");
  assert(architecture.nodes[1].x > architecture.nodes[0].x);
  assert.equal(architecture.nodes[0].y, architecture.nodes[1].y);

  const flow = threeNodeDiagram("flowchart");
  assert(flow.nodes[1].y > flow.nodes[0].y);
  assert.equal(flow.nodes[0].x, flow.nodes[1].x);
});

test("auto layout stays stable for cycles", () => {
  const nextId = ids();
  let diagram = threeNodeDiagram("architecture", nextId);
  diagram = connectDiagramNodes(diagram, diagram.nodes[2].id, diagram.nodes[0].id, nextId);
  const once = layoutDiagram(diagram, { x: 20, y: 40 });
  const twice = layoutDiagram(once, { x: 20, y: 40 });
  assert.deepEqual(
    twice.nodes.map(({ x, y }) => ({ x, y })),
    once.nodes.map(({ x, y }) => ({ x, y })),
  );
});

test("connect, group, layout, and snapshot round-trip preserve Notespace ids", () => {
  const nextId = ids();
  let diagram = threeNodeDiagram("architecture", nextId);
  diagram = addCatalogNode(diagram, getCatalogItem("redis"), { x: 900, y: 50 }, nextId);
  diagram = connectDiagramNodes(diagram, diagram.nodes[1].id, diagram.nodes[3].id, nextId);
  diagram = groupDiagramNodes(diagram, [diagram.nodes[1].id, diagram.nodes[3].id], nextId);
  diagram = layoutDiagram(diagram);

  assert.equal(diagram.nodes.length, 4);
  assert.equal(diagram.groups.length, 1);
  assert(diagram.edges.some((edge) => edge.to === diagram.nodes[3].id));

  const data = withStructuredDiagrams({ elements: [] }, [diagram]);
  const restored = readStructuredDiagrams(data);
  assert.equal(restored[0].id, diagram.id);
  assert.equal(restored[0].nodes[3].id, diagram.nodes[3].id);
});

test("structured commands rename and remove graph values without replacing identities", () => {
  const nextId = ids();
  let diagram = threeNodeDiagram("architecture", nextId);
  diagram = groupDiagramNodes(diagram, [diagram.nodes[0].id, diagram.nodes[1].id], nextId);
  const nodeId = diagram.nodes[0].id;
  const edgeId = diagram.edges[0].id;
  const groupId = diagram.groups[0].id;

  diagram = renameDiagramNode(diagram, nodeId, "Web client");
  diagram = renameDiagramEdge(diagram, edgeId, "HTTPS");
  diagram = renameDiagramGroup(diagram, groupId, "Public tier");

  assert.equal(diagram.nodes.find((node) => node.id === nodeId)?.label, "Web client");
  assert.equal(diagram.edges.find((edge) => edge.id === edgeId)?.label, "HTTPS");
  assert.equal(diagram.groups.find((group) => group.id === groupId)?.label, "Public tier");

  diagram = removeDiagramEdge(diagram, edgeId);
  assert(!diagram.edges.some((edge) => edge.id === edgeId));
  diagram = ungroupDiagramNodes(diagram, groupId);
  assert.equal(diagram.groups.length, 0);
  assert(diagram.nodes.every((node) => node.groupId !== groupId));
});

test("regrouping keeps one group owner per node", () => {
  const nextId = ids();
  let diagram = threeNodeDiagram("architecture", nextId);
  diagram = groupDiagramNodes(diagram, [diagram.nodes[0].id, diagram.nodes[1].id], nextId);
  const firstGroupId = diagram.groups[0].id;
  diagram = groupDiagramNodes(diagram, [diagram.nodes[1].id, diagram.nodes[2].id], nextId);
  assert(!diagram.groups.some((group) => group.id === firstGroupId));
  assert.equal(diagram.groups.length, 1);
  assert.equal(diagram.nodes[1].groupId, diagram.groups[0].id);
  assert.equal(diagram.nodes[2].groupId, diagram.groups[0].id);
});

test("selection and element sync follow native Excalidraw move, resize, label, and delete", () => {
  const diagram = threeNodeDiagram("flowchart");
  const first = diagram.nodes[0];
  const second = diagram.nodes[1];
  const firstText = "text-first";
  const elements = [
    { id: first.elementId, x: 120, y: 140, width: 220, height: 90, boundElements: [{ id: firstText, type: "text" }] },
    { id: firstText, containerId: first.elementId, text: "○\nBegin" },
    ...diagram.nodes.slice(2).map((node) => ({ id: node.elementId, x: node.x, y: node.y, width: node.width, height: node.height })),
    { id: second.elementId, isDeleted: true },
    ...diagram.edges.map((edge) => ({ id: edge.elementId })),
  ];

  const selection = selectionForElements([diagram], [firstText], elements);
  assert.deepEqual(selection.nodeIds, [first.id]);

  const [synced] = syncDiagramsFromElements([diagram], elements);
  assert.equal(synced.nodes[0].x, first.x);
  assert.equal(synced.nodes[0].width, first.width);
  assert.equal(synced.nodes[0].label, "Begin");
  assert(!synced.nodes.some((node) => node.id === second.id));
  assert(!synced.edges.some((edge) => edge.from === second.id || edge.to === second.id));

  const hydrated = hydrateDiagramGeometryFromElements(synced, elements);
  assert.equal(hydrated.nodes[0].x, 120);
  assert.equal(hydrated.nodes[0].width, 220);
});

test("icon, connection, and boundary labels round-trip through native elements", () => {
  const nextId = ids();
  let diagram = threeNodeDiagram("architecture", nextId);
  diagram = groupDiagramNodes(diagram, [diagram.nodes[0].id, diagram.nodes[1].id], nextId);
  const first = diagram.nodes[0];
  const edge = diagram.edges[0];
  const group = diagram.groups[0];
  const edgeText = "edge-text";
  const groupText = "group-text";
  const elements = [
    ...diagram.nodes.map((node) => ({ id: node.elementId, x: node.x, y: node.y, width: node.width, height: node.height })),
    { id: diagramNodeLabelElementId(first.elementId), text: "Browser client" },
    { id: edge.elementId, boundElements: [{ id: edgeText, type: "text" }] },
    { id: edgeText, containerId: edge.elementId, text: "HTTPS" },
    ...diagram.edges.slice(1).map((item) => ({ id: item.elementId })),
    { id: group.elementId, boundElements: [{ id: groupText, type: "text" }] },
    { id: groupText, containerId: group.elementId, text: "Public tier" },
  ];

  const edgeSelection = selectionForElements([diagram], [edgeText], elements);
  assert.equal(edgeSelection.edgeId, edge.id);
  const groupSelection = selectionForElements([diagram], [groupText], elements);
  assert.equal(groupSelection.groupId, group.id);

  const [synced] = syncDiagramsFromElements([diagram], elements);
  assert.equal(synced.nodes[0].label, "Browser client");
  assert.equal(synced.edges[0].label, "HTTPS");
  assert.equal(synced.groups[0].label, "Public tier");
});


test("directional spawn positions and connects a structured node", () => {
  const nextId = ids();
  const diagram = createDiagramWithNode("architecture", getCatalogItem("server"), { x: 40, y: 60 }, nextId);
  const source = diagram.nodes[0];
  const result = spawnConnectedStructuredNode(diagram, source.id, "right", 120, nextId);
  assert(result);
  const spawned = result.diagram.nodes.find((node) => node.id === result.nodeId);
  assert(spawned);
  assert.deepEqual(
    { x: spawned.x, y: spawned.y },
    directionalSpawnPosition(source, "right", 120),
  );
  assert.equal(result.diagram.edges.at(-1)?.from, source.id);
  assert.equal(result.diagram.edges.at(-1)?.to, spawned.id);
});

test("directional spawn keeps the new structured node inside its source group", () => {
  const nextId = ids();
  let diagram = threeNodeDiagram("architecture", nextId);
  diagram = groupDiagramNodes(diagram, [diagram.nodes[0].id, diagram.nodes[1].id], nextId);
  const source = diagram.nodes[0];
  const result = spawnConnectedStructuredNode(diagram, source.id, "down", 120, nextId);
  assert(result);
  const spawned = result.diagram.nodes.find((node) => node.id === result.nodeId);
  assert(spawned?.groupId);
  assert(result.diagram.groups.find((group) => group.id === spawned.groupId)?.nodeIds.includes(spawned.id));
});
