import assert from "node:assert/strict";
import test from "node:test";
import { MAX_WORKSPACE_PANES, canAddPane, defaultLayout, findPane, hasCanvasPane, leafCount, leaves, mapNode, paneFocusTarget, paneInteractionState, removeNode, updateSplit } from "./pane-layout.ts";
import type { PaneNode } from "./pane-layout.ts";

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

test("interaction rules disable duplicate Canvas and note split when no unopened note exists", () => {
  const layout = defaultLayout("note-1");
  const actions = paneInteractionState(layout, ["note-1"]);
  assert.equal(actions.canvasOpen, true);
  assert.equal(actions.hasUnopenedNote, false);
  assert.equal(actions.canOpenCanvas, false);
  assert.equal(actions.canOpenNote, false);
  assert.equal(actions.canSplitNote, false);
  assert.equal(actions.canClosePane, true);
});

test("interaction rules enable note and Canvas actions when capacity and content exist", () => {
  const layout: PaneNode = { kind: "leaf", pane: { id: "pane-1", kind: "note", noteId: "note-1" } };
  const actions = paneInteractionState(layout, ["note-1", "note-2"]);
  assert.equal(actions.nextUnopenedNoteId, "note-2");
  assert.equal(actions.canOpenCanvas, true);
  assert.equal(actions.canOpenNote, true);
  assert.equal(actions.canSplitNote, true);
  assert.equal(actions.canClosePane, false);
});

test("interaction rules stop adding panes at the workspace limit", () => {
  const layout: PaneNode = {
    kind: "split", id: "root", direction: "row", ratio: .5,
    first: {
      kind: "split", id: "left", direction: "column", ratio: .5,
      first: { kind: "leaf", pane: { id: "p1", kind: "note", noteId: "n1" } },
      second: { kind: "leaf", pane: { id: "p2", kind: "note", noteId: "n2" } },
    },
    second: {
      kind: "split", id: "right", direction: "column", ratio: .5,
      first: { kind: "leaf", pane: { id: "p3", kind: "note", noteId: "n3" } },
      second: { kind: "leaf", pane: { id: "p4", kind: "canvas" } },
    },
  };
  const actions = paneInteractionState(layout, ["n1", "n2", "n3", "n4"]);
  assert.equal(actions.paneLimitReached, true);
  assert.equal(actions.hasUnopenedNote, true);
  assert.equal(actions.canOpenNote, false);
  assert.equal(actions.canOpenCanvas, false);
  assert.equal(actions.canSplitNote, false);
});

test("focus target follows the active pane's containing split and falls back to the pane", () => {
  const split = defaultLayout("note-1");
  const notePane = leaves(split).find((pane) => pane.kind === "note");
  assert.ok(notePane);
  assert.deepEqual(paneFocusTarget(split, notePane.id), { kind: "split", id: split.kind === "split" ? split.id : "" });

  const single: PaneNode = { kind: "leaf", pane: { id: "only", kind: "note", noteId: "note-1" } };
  assert.deepEqual(paneFocusTarget(single, "only"), { kind: "pane", id: "only" });
});
