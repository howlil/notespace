import assert from "node:assert/strict";
import test from "node:test";
import { MAX_WORKSPACE_PANES, canAddPane, defaultLayout, findPane, hasCanvasPane, leafCount, leaves, mapNode, removeNode, updateSplit } from "./pane-layout.ts";

test("default workspace layout owns one note pane and one canvas pane", () => {
  const layout = defaultLayout("note-1");
  assert.equal(leafCount(layout), 2);
  assert.equal(hasCanvasPane(layout), true);
  assert.equal(leaves(layout).filter((pane) => pane.kind === "note").length, 1);
  assert.equal(leaves(layout).find((pane) => pane.kind === "note")?.noteId, "note-1");
});

test("pane split ratio is clamped to a usable range", () => {
  const layout = defaultLayout("note-1");
  if (layout.kind !== "split") assert.fail("default layout should be a split");
  const low = updateSplit(layout, layout.id, -10);
  const high = updateSplit(layout, layout.id, 10);
  assert.equal(low.kind === "split" ? low.ratio : null, 0.2);
  assert.equal(high.kind === "split" ? high.ratio : null, 0.8);
});

test("removing a leaf collapses its containing split to the surviving sibling", () => {
  const layout = defaultLayout("note-1");
  const notePane = leaves(layout).find((pane) => pane.kind === "note");
  assert.ok(notePane);
  const next = removeNode(layout, notePane.id);
  assert.equal(leafCount(next), 1);
  assert.equal(leaves(next)[0]?.kind, "canvas");
});

test("pane mapping updates only the targeted leaf and preserves the pane limit contract", () => {
  const layout = defaultLayout("note-1");
  const notePane = leaves(layout).find((pane) => pane.kind === "note");
  assert.ok(notePane);
  const next = mapNode(layout, notePane.id, (node) => node.kind === "leaf" ? { ...node, pane: { ...node.pane, noteId: "note-2" } } : node);
  assert.equal(findPane(next, notePane.id)?.noteId, "note-2");
  assert.equal(canAddPane(next), leafCount(next) < MAX_WORKSPACE_PANES);
});
