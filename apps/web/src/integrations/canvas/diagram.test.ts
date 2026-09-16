import assert from "node:assert/strict";
import test from "node:test";
import {
  buildArchitectureTemplate,
  buildFlowchartTemplate,
  diagramCatalog,
  filterDiagramCatalog,
} from "./diagram";

test("diagram catalog exposes searchable general, tech, and cloud components", () => {
  assert.ok(diagramCatalog.length >= 12);
  assert.ok(diagramCatalog.some((item) => item.category === "General"));
  assert.ok(diagramCatalog.some((item) => item.category === "Tech"));
  assert.ok(diagramCatalog.some((item) => item.category === "Cloud"));
  assert.deepEqual(filterDiagramCatalog("postgres").map((item) => item.id), ["postgres"]);
  assert.ok(filterDiagramCatalog("cloud", "Cloud").length >= 3);
});

test("architecture template creates stable nodes and bound arrows", () => {
  const elements = buildArchitectureTemplate({ x: 10, y: 20 }, "arch-1");
  const ids = new Set(elements.map((element) => element.id));
  assert.equal(ids.size, elements.length);
  assert.equal(elements.filter((element) => element.type === "rectangle").length, 4);
  assert.equal(elements.filter((element) => element.type === "arrow").length, 3);
  for (const arrow of elements.filter((element) => element.type === "arrow")) {
    assert.ok(arrow.start?.id && ids.has(arrow.start.id));
    assert.ok(arrow.end?.id && ids.has(arrow.end.id));
  }
});

test("flowchart template includes start, process, decision, and done nodes", () => {
  const elements = buildFlowchartTemplate({ x: 0, y: 0 }, "flow-1");
  const shapes = elements.filter((element) => element.type !== "arrow");
  assert.deepEqual(shapes.map((element) => element.type), ["ellipse", "rectangle", "diamond", "ellipse"]);
  assert.deepEqual(shapes.map((element) => element.label?.text), ["Start", "Process", "Decision", "Done"]);
});
