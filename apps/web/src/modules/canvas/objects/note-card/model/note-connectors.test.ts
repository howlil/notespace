import assert from "node:assert/strict";
import test from "node:test";
import { arrowsBoundTo, pruneBoundElements, releaseArrowBindings } from "./note-connectors.ts";

type TestElement = {
  id: string;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  boundElements?: readonly { id: string; type: string }[] | null;
};

const note: TestElement = { id: "note", boundElements: [{ id: "arrow-in", type: "arrow" }, { id: "arrow-other", type: "arrow" }] };
const arrowIn: TestElement = { id: "arrow-in", startBinding: { elementId: "shape" }, endBinding: { elementId: "note" } };
const arrowOut: TestElement = { id: "arrow-out", startBinding: { elementId: "note" }, endBinding: null };
const unrelated: TestElement = { id: "arrow-other", startBinding: { elementId: "shape" }, endBinding: { elementId: "other" } };

test("arrows bound at either end of a Note are found, others are not", () => {
  assert.deepEqual(arrowsBoundTo([note, arrowIn, arrowOut, unrelated], "note"), ["arrow-in", "arrow-out"]);
});

test("removing a Note releases its connectors instead of leaving dangling bindings", () => {
  const next = releaseArrowBindings([note, arrowIn, arrowOut, unrelated], "note");
  assert.equal(next.find((element) => element.id === "arrow-in")?.endBinding, null);
  assert.deepEqual(next.find((element) => element.id === "arrow-in")?.startBinding, { elementId: "shape" });
  assert.equal(next.find((element) => element.id === "arrow-out")?.startBinding, null);
  assert.equal(next.find((element) => element.id === "arrow-other"), unrelated);
});

test("pruning deleted connector ids removes them from surviving elements and preserves unrelated refs", () => {
  const next = pruneBoundElements([note, arrowIn, unrelated], new Set(["arrow-in"]));
  assert.deepEqual(next.find((element) => element.id === "note")?.boundElements, [{ id: "arrow-other", type: "arrow" }]);
  assert.equal(next.find((element) => element.id === "arrow-other"), unrelated);
});

test("updateElement callback is used when releasing bindings or pruning boundElements", () => {
  const released = releaseArrowBindings([arrowOut], "note", (el, patch) => ({ ...el, ...patch, version: 2 } as typeof arrowOut & { version: number }));
  assert.equal((released[0] as typeof arrowOut & { version: number }).version, 2);
  const pruned = pruneBoundElements([note], new Set(["arrow-in", "arrow-other"]), (el, patch) => ({ ...el, ...patch, version: 3 } as typeof note & { version: number }));
  assert.equal(pruned[0].boundElements, null);
  assert.equal((pruned[0] as typeof note & { version: number }).version, 3);
});
