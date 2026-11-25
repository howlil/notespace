import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasController, isOverlayBlockingCanvas } from "./canvas-controller.ts";

test("CanvasController isolates viewport, selection, scene, and overlay slices with dedupe", () => {
  const controller = createCanvasController({
    elements: [],
    overlayElements: [],
    backgroundColor: "#ffffff",
  });

  let viewportUpdates = 0;
  let selectionUpdates = 0;
  let sceneUpdates = 0;
  let overlayUpdates = 0;

  controller.viewport.subscribe(() => { viewportUpdates += 1; });
  controller.selection.subscribe(() => { selectionUpdates += 1; });
  controller.scene.subscribe(() => { sceneUpdates += 1; });
  controller.overlay.subscribe(() => { overlayUpdates += 1; });

  // Viewport updates only notify viewport subscribers
  controller.setViewport({ zoom: 1.5, scrollX: 10, scrollY: 20 });
  controller.setViewport({ zoom: 1.5, scrollX: 10, scrollY: 20 });
  assert.equal(viewportUpdates, 1);
  assert.equal(selectionUpdates, 0);
  assert.equal(sceneUpdates, 0);
  assert.equal(overlayUpdates, 0);

  // Selection anchor dedupes structurally equal rectangles
  controller.setSelection({
    selectedElementId: "el-1",
    selectedElementCount: 1,
    selectionAnchor: { left: 10, top: 20, right: 110, bottom: 80 },
  });
  controller.setSelection({
    selectedElementId: "el-1",
    selectedElementCount: 1,
    selectionAnchor: { left: 10, top: 20, right: 110, bottom: 80 },
  });
  assert.equal(selectionUpdates, 1);

  // Scene slice dedupes identical values
  controller.setScene({ backgroundColor: "#ffffff" });
  assert.equal(sceneUpdates, 0);
  controller.setScene({ backgroundColor: "#f5f5f5", gridModeEnabled: true });
  assert.equal(sceneUpdates, 1);
});

test("CanvasController enforces mutually exclusive overlay transitions", () => {
  const controller = createCanvasController({
    elements: [],
    overlayElements: [],
    backgroundColor: "#ffffff",
  });

  assert.deepEqual(controller.overlay.getSnapshot(), { kind: "none" });

  controller.toggleToolPopover("diagram");
  assert.deepEqual(controller.overlay.getSnapshot(), { kind: "tool-popover", panel: "diagram" });

  // Toggling the same popover closes it
  controller.toggleToolPopover("diagram");
  assert.deepEqual(controller.overlay.getSnapshot(), { kind: "none" });

  // Opening a tool popover replaces any other active overlay
  controller.setOverlay({ kind: "view-menu" });
  controller.toggleToolPopover("diagram");
  assert.deepEqual(controller.overlay.getSnapshot(), { kind: "tool-popover", panel: "diagram" });

  // Opening context menu replaces any active editing/popover state
  controller.setOverlay({ kind: "editing-note", elementId: "note-1" });
  controller.openContextMenu({ x: 120, y: 240 });
  assert.deepEqual(controller.overlay.getSnapshot(), { kind: "context-menu", point: { x: 120, y: 240 } });

  controller.closeOverlays();
  assert.deepEqual(controller.overlay.getSnapshot(), { kind: "none" });
});

test("isOverlayBlockingCanvas distinguishes blocking modals/editors from non-blocking tool chrome", () => {
  const base = { contextualInteractionActive: false, nativeContextMenuOpen: false, viewModeEnabled: false };

  assert.equal(isOverlayBlockingCanvas({ kind: "none" }, base), false);
  assert.equal(isOverlayBlockingCanvas({ kind: "tool-settings" }, base), false);
  assert.equal(isOverlayBlockingCanvas({ kind: "view-menu" }, base), false);
  assert.equal(isOverlayBlockingCanvas({ kind: "selection-panel" }, base), false);

  assert.equal(isOverlayBlockingCanvas({ kind: "editing-code", elementId: "c1" }, base), true);
  assert.equal(isOverlayBlockingCanvas({ kind: "editing-note", elementId: "n1" }, base), true);
  assert.equal(isOverlayBlockingCanvas({ kind: "context-menu", point: { x: 0, y: 0 } }, base), true);
  assert.equal(isOverlayBlockingCanvas({ kind: "tool-popover", panel: "diagram" }, base), true);

  assert.equal(isOverlayBlockingCanvas({ kind: "none" }, { ...base, contextualInteractionActive: true }), true);
  assert.equal(isOverlayBlockingCanvas({ kind: "none" }, { ...base, nativeContextMenuOpen: true }), true);
  assert.equal(isOverlayBlockingCanvas({ kind: "none" }, { ...base, viewModeEnabled: true }), true);
});
