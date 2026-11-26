import assert from "node:assert/strict";
import test from "node:test";
import { withCanvasNoteReference } from "../../../../entities/note.ts";
import { withCanvasWorkspaceShortcut } from "../../../../entities/workspace-shortcut.ts";
import {
  buildWorkspaceOutlineTree,
  computeFitSectionBounds,
  computeSectionBoundsAroundElements,
  computeTidySectionLayout,
  findDeepestContainingFrame,
  isElementContainedInFrame,
} from "./section-model.ts";

test("computeSectionBoundsAroundElements computes padded bounding box and ignores deleted elements", () => {
  assert.equal(computeSectionBoundsAroundElements([]), null);
  assert.equal(computeSectionBoundsAroundElements([{ x: 0, y: 0, width: 100, height: 100, isDeleted: true }]), null);

  const bounds = computeSectionBoundsAroundElements([
    { x: 100, y: 200, width: 120, height: 80 },
    { x: 300, y: 150, width: 100, height: 200 },
    { x: -999, y: -999, width: 10, height: 10, isDeleted: true },
  ], 32);

  assert.deepEqual(bounds, {
    x: 68,
    y: 118,
    width: 364,
    height: 264,
  });
});

test("isElementContainedInFrame and findDeepestContainingFrame select smallest frame with deterministic ID tie-break", () => {
  const outer = { id: "frame-outer", x: 0, y: 0, width: 500, height: 500 };
  const innerB = { id: "frame-b", x: 50, y: 50, width: 200, height: 200 };
  const innerA = { id: "frame-a", x: 50, y: 50, width: 200, height: 200 };
  const card = { id: "card-1", x: 100, y: 100, width: 80, height: 60 };
  const outside = { id: "card-2", x: 600, y: 600, width: 80, height: 60 };

  assert.equal(isElementContainedInFrame(card, outer), true);
  assert.equal(isElementContainedInFrame(outside, outer), false);
  assert.equal(isElementContainedInFrame(outer, outer), false);

  const deepest = findDeepestContainingFrame(card, [outer, innerB, innerA]);
  assert.equal(deepest?.id, "frame-a");
  assert.equal(findDeepestContainingFrame(outside, [outer, innerB, innerA]), null);
});

test("computeFitSectionBounds preserves frame bounds when empty and wraps members when present", () => {
  const frame = { x: 10, y: 20, width: 300, height: 200 };
  assert.deepEqual(computeFitSectionBounds(frame, []), frame);

  const fitted = computeFitSectionBounds(frame, [
    { x: 50, y: 60, width: 100, height: 80 },
    { x: 200, y: 90, width: 120, height: 100 },
  ], 28);
  assert.deepEqual(fitted, {
    x: 22,
    y: 32,
    width: 326,
    height: 186,
  });
});

test("computeTidySectionLayout arranges members deterministically in rows within frame width", () => {
  const frame = { x: 0, y: 0, width: 300, height: 400 };
  const layout = computeTidySectionLayout(frame, [
    { id: "c", x: 180, y: 30, width: 100, height: 50 },
    { id: "a", x: 40, y: 25, width: 100, height: 80 },
    { id: "b", x: 50, y: 120, width: 100, height: 40 },
  ], 16, 28);

  assert.deepEqual(layout, [
    { id: "a", x: 28, y: 28 },
    { id: "c", x: 144, y: 28 },
    { id: "b", x: 28, y: 124 },
  ]);
});

test("buildWorkspaceOutlineTree groups children under live frames and surfaces ungrouped notes and shortcuts", () => {
  const tree = buildWorkspaceOutlineTree(
    [
      { id: "f1", type: "frame", name: "Research", x: 0, y: 0, width: 400, height: 400 },
      {
        id: "n1",
        type: "rectangle",
        frameId: "f1",
        x: 20,
        y: 20,
        width: 200,
        height: 100,
        customData: withCanvasNoteReference(undefined, { noteId: "note-1", instanceId: "inst-1" }),
      },
      {
        id: "s1",
        type: "rectangle",
        frameId: "f1",
        x: 20,
        y: 140,
        width: 200,
        height: 80,
        customData: withCanvasWorkspaceShortcut(undefined, { targetWorkspaceId: "ws-2" }),
      },
      {
        id: "r1",
        type: "rectangle",
        frameId: "f1",
        x: 240,
        y: 20,
        width: 100,
        height: 60,
      },
      {
        id: "n2",
        type: "rectangle",
        frameId: null,
        x: 500,
        y: 20,
        width: 200,
        height: 100,
        customData: withCanvasNoteReference(undefined, { noteId: "note-2", instanceId: "inst-2" }),
      },
      {
        id: "s2",
        type: "rectangle",
        frameId: "missing-frame",
        x: 500,
        y: 140,
        width: 200,
        height: 80,
        customData: withCanvasWorkspaceShortcut(undefined, { targetWorkspaceId: "ws-missing" }),
      },
      {
        id: "r2",
        type: "ellipse",
        frameId: null,
        x: 500,
        y: 250,
        width: 80,
        height: 80,
      },
    ],
    (noteId) => (noteId === "note-1" ? "First Note" : undefined),
    (workspaceId) => (workspaceId === "ws-2" ? "Sub-project" : undefined),
  );

  assert.deepEqual(tree, {
    sections: [
      {
        elementId: "f1",
        label: "Research",
        children: [
          { elementId: "n1", noteId: "note-1", label: "First Note", kind: "note" },
          { elementId: "s1", label: "Sub-project", kind: "shortcut" },
          { elementId: "r1", label: "rectangle", kind: "object" },
        ],
      },
    ],
    ungrouped: [
      { elementId: "n2", noteId: "note-2", label: "Untitled note", kind: "note" },
      { elementId: "s2", label: "Unavailable workspace", kind: "shortcut" },
    ],
  });
});
