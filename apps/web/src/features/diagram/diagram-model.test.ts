import assert from "node:assert/strict";
import test from "node:test";
import {
  addCatalogNode,
  connectDiagramNodes,
  createDiagramWithNode,
  createStarterDiagram,
  getCatalogItem,
  groupDiagramNodes,
  layoutDiagram,
  readStructuredDiagrams,
  searchDiagramCatalog,
  searchEraserCatalog,
  selectionForElements,
  syncDiagramsFromElements,
  withStructuredDiagrams,
} from "./diagram-model.ts";

function ids() {
  let value = 0;
  return (prefix: string) => `${prefix}-${++value}`;
}

test("catalog search supports provider categories and keywords", () => {
  assert(searchEraserCatalog("postgres").some((item) => item.key === "postgres"));
  assert(searchDiagramCatalog("storage", "aws").some((item) => item.key === "aws-s3"));
  assert(searchDiagramCatalog("function", "azure").some((item) => item.key === "azure-functions"));
});

test("the generated catalog contains all documented Eraser entries", () => {
  assert.equal(searchEraserCatalog("").length, 3947);
  assert.equal(searchEraserCatalog("lambda")[0]?.key, "aws-lambda");
  assert.equal(searchEraserCatalog("cloud run", "gcp")[0]?.key, "gcp-cloud-run");
});

test("icon-only insertion persists a native image-sized diagram node mode", () => {
  const diagram = createDiagramWithNode("architecture", getCatalogItem("aws-lambda"), { x: 10, y: 20 }, ids(), "icon");
  assert.equal(diagram.nodes[0].renderMode, "icon");
  assert.equal(diagram.nodes[0].width, 56);
  assert.equal(diagram.nodes[0].height, 56);
  assert.equal(readStructuredDiagrams(withStructuredDiagrams({}, [diagram]))[0].nodes[0].renderMode, "icon");
});

test("architecture and flow starters receive deterministic auto-layout", () => {
  const architecture = createStarterDiagram("architecture", { x: 10, y: 20 }, ids());
  assert.equal(architecture.nodes.length, 3);
  assert(architecture.nodes[1].x > architecture.nodes[0].x);
  assert.equal(architecture.nodes[0].y, architecture.nodes[1].y);

  const flow = createStarterDiagram("flowchart", { x: 10, y: 20 }, ids());
  assert(flow.nodes[1].y > flow.nodes[0].y);
  assert.equal(flow.nodes[0].x, flow.nodes[1].x);
});

test("connect, group, layout, and snapshot round-trip preserve Notespace ids", () => {
  const nextId = ids();
  let diagram = createStarterDiagram("architecture", { x: 0, y: 0 }, nextId);
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

test("selection and element sync follow native Excalidraw move, resize, label, and delete", () => {
  const diagram = createStarterDiagram("flowchart", { x: 0, y: 0 }, ids());
  const first = diagram.nodes[0];
  const second = diagram.nodes[1];
  const firstText = "text-first";
  const elements = [
    { id: first.elementId, x: 120, y: 140, width: 220, height: 90, boundElements: [{ id: firstText, type: "text" }] },
    { id: firstText, containerId: first.elementId, text: "○\nBegin" },
    { id: second.elementId, isDeleted: true },
    ...diagram.nodes.slice(2).map((node) => ({ id: node.elementId, x: node.x, y: node.y, width: node.width, height: node.height })),
    ...diagram.edges.map((edge) => ({ id: edge.elementId })),
  ];

  const selection = selectionForElements([diagram], [firstText], elements);
  assert.deepEqual(selection.nodeIds, [first.id]);

  const [synced] = syncDiagramsFromElements([diagram], elements);
  assert.equal(synced.nodes[0].x, 120);
  assert.equal(synced.nodes[0].width, 220);
  assert.equal(synced.nodes[0].label, "Begin");
  assert(!synced.nodes.some((node) => node.id === second.id));
  assert(!synced.edges.some((edge) => edge.from === second.id || edge.to === second.id));
});
