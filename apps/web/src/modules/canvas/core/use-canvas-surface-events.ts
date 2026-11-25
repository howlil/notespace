import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, type MouseEvent, type MutableRefObject, type PointerEvent, type RefObject } from "react";
import { readCanvasNoteReference } from "../../../entities/note";
import { readCanvasCodeBlock } from "../objects/code-block/model/canvas-code-block";
import { codeElementContainsClientPoint } from "../objects/code-block/model/canvas-code-block-layout";
import { directionFromKey, type DirectionalSpawnDirection } from "../objects/flowchart/CanvasDirectionalSpawn";
import type { CanvasController, CanvasOverlayMode } from "./canvas-controller";

export function useCanvasSurfaceEvents({
  controller,
  apiRef,
  surfaceRef,
  lastContextPointRef,
  overlayKind,
  viewModeEnabled,
  editingCodeBlockId,
  editingNoteElementId,
  canvasOverlayInteractionActive,
  flowchartPreviewDirection,
  canCreateNote,
  toggleFullMode,
  trackFlowchartPointer,
  clearFlowchartHover,
  focusCanvasEditor,
  insertNoteAt,
  startNoteEditing,
  setEditingCodeBlockId,
  spawnDiagramBranch,
  beginNativeFlowchartPreview,
  commitNativeFlowchartPreview,
}: {
  controller: CanvasController;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  lastContextPointRef: MutableRefObject<{ x: number; y: number } | null>;
  overlayKind: CanvasOverlayMode["kind"];
  viewModeEnabled: boolean;
  editingCodeBlockId: string | null;
  editingNoteElementId: string | null;
  canvasOverlayInteractionActive: boolean;
  flowchartPreviewDirection: DirectionalSpawnDirection | null;
  canCreateNote: boolean;
  toggleFullMode: () => void;
  trackFlowchartPointer: (clientX: number, clientY: number, pointerType: "mouse" | "pen" | "touch") => void;
  clearFlowchartHover: () => void;
  focusCanvasEditor: () => void;
  insertNoteAt: (sceneX: number, sceneY: number) => Promise<void> | void;
  startNoteEditing: (elementId: string, point: { clientX: number; clientY: number } | null) => void;
  setEditingCodeBlockId: (id: string | null) => void;
  spawnDiagramBranch: (direction: DirectionalSpawnDirection) => boolean;
  beginNativeFlowchartPreview: (direction: DirectionalSpawnDirection) => boolean;
  commitNativeFlowchartPreview: (direction?: DirectionalSpawnDirection) => void;
}) {
  useEffect(() => {
    const onFullModeKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      toggleFullMode();
    };
    window.addEventListener("keydown", onFullModeKey, true);
    return () => window.removeEventListener("keydown", onFullModeKey, true);
  }, [toggleFullMode]);

  const handleDirectionalSpawnKeyDown = useCallback((event: KeyboardEvent) => {
    const direction = directionFromKey(event.key);
    if (!direction || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
    if (canvasOverlayInteractionActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const target = event.target;
    const canvasPanelOpen = target instanceof Element
      ? Boolean(target.closest('.notespace-selection-actions, [role="dialog"]'))
      : Boolean(document.querySelector('.notespace-selection-actions [role="dialog"]'));
    if (canvasPanelOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.isComposing) return;
    const value = apiRef.current;
    if (!value) return;
    const state = value.getAppState() as AppState & { editingLinearElement?: unknown };
    if (state.editingTextElement || state.editingLinearElement || state.openDialog) return;

    if (spawnDiagramBranch(direction)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const selectedIds = Object.entries(state.selectedElementIds).filter(([, selected]) => selected).map(([id]) => id);
    if (selectedIds.length !== 1) return;

    if (!beginNativeFlowchartPreview(direction)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, [apiRef, beginNativeFlowchartPreview, canvasOverlayInteractionActive, spawnDiagramBranch]);

  const handleDirectionalSpawnKeyUp = useCallback((event: KeyboardEvent) => {
    if (!flowchartPreviewDirection) return;
    const direction = directionFromKey(event.key);
    if (!direction && event.key !== "Alt") return;
    if (canvasOverlayInteractionActive) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    commitNativeFlowchartPreview();
  }, [canvasOverlayInteractionActive, commitNativeFlowchartPreview, flowchartPreviewDirection]);

  useEffect(() => {
    window.addEventListener("keydown", handleDirectionalSpawnKeyDown, true);
    window.addEventListener("keyup", handleDirectionalSpawnKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleDirectionalSpawnKeyDown, true);
      window.removeEventListener("keyup", handleDirectionalSpawnKeyUp, true);
    };
  }, [handleDirectionalSpawnKeyDown, handleDirectionalSpawnKeyUp]);

  const onPointerMoveCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const target = event.target;
    if (target instanceof Element && target.closest(".excalidraw__canvas, [data-flowchart-handle]")) {
      trackFlowchartPointer(event.clientX, event.clientY, event.pointerType);
    } else {
      clearFlowchartHover();
    }
  }, [clearFlowchartHover, trackFlowchartPointer]);

  const onPointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") trackFlowchartPointer(event.clientX, event.clientY, "touch");
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".excalidraw__canvas")) return;
    if (overlayKind === "tool-settings") controller.closeOverlays();
    focusCanvasEditor();
  }, [controller, focusCanvasEditor, overlayKind, trackFlowchartPointer]);

  const onContextMenuCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    lastContextPointRef.current = { x: event.clientX, y: event.clientY };
    if (viewModeEnabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("input, textarea, select, [contenteditable='true'], [contenteditable=''], .cm-editor")) return;
    const codeHost = target.closest<HTMLElement>("[data-canvas-code-block]");
    if (codeHost && !editingCodeBlockId) {
      const codeId = codeHost.dataset.canvasCodeBlock;
      if (codeId) {
        event.preventDefault();
        event.stopPropagation();
        controller.setSelection({ selectedElementCount: 1, selectedElementId: codeId });
        apiRef.current?.updateScene({
          appState: { selectedElementIds: { [codeId]: true }, contextMenu: null },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        controller.openContextMenu({ x: event.clientX, y: event.clientY });
      }
    }
  }, [apiRef, controller, editingCodeBlockId, lastContextPointRef, viewModeEnabled]);

  const onDoubleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (editingCodeBlockId || editingNoteElementId) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".notespace-selection-actions, .notespace-note-ui, [role='toolbar'], [role='dialog'], [data-flowchart-handle]")) return;
    const value = apiRef.current;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!value || !rect) return;
    const viewport = controller.viewport.getSnapshot();
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (viewModeEnabled || !canCreateNote) return;
      if (!(target instanceof Element) || !target.closest(".excalidraw__canvas")) return;
      const appState = value.getAppState();
      if (appState.openDialog) return;
      const hitsCustomCard = value.getSceneElementsIncludingDeleted().some((candidate) => (
        !candidate.isDeleted
        && (Boolean(readCanvasNoteReference(candidate)) || Boolean(readCanvasCodeBlock(candidate)))
        && codeElementContainsClientPoint(candidate, viewport, rect, event.clientX, event.clientY)
      ));
      if (hitsCustomCard) return;
      const zoom = appState.zoom.value || 1;
      const sceneX = (event.clientX - rect.left) / zoom - appState.scrollX;
      const sceneY = (event.clientY - rect.top) / zoom - appState.scrollY;
      event.preventDefault();
      event.stopPropagation();
      void insertNoteAt(sceneX, sceneY);
      return;
    }
    const selectedIds = Object.entries(value.getAppState().selectedElementIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    if (selectedIds.length !== 1) return;
    const element = value.getSceneElementsIncludingDeleted().find((candidate) => candidate.id === selectedIds[0] && !candidate.isDeleted);
    if (!element) return;
    if (readCanvasNoteReference(element)) {
      if (!codeElementContainsClientPoint(element, viewport, rect, event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
      controller.setSelection({ selectedElementId: element.id });
      startNoteEditing(element.id, { clientX: event.clientX, clientY: event.clientY });
      return;
    }
    if (!readCanvasCodeBlock(element)) return;
    if (!codeElementContainsClientPoint(element, viewport, rect, event.clientX, event.clientY)) return;
    event.preventDefault();
    event.stopPropagation();
    controller.setSelection({ selectedElementId: element.id });
    setEditingCodeBlockId(element.id);
  }, [
    apiRef,
    canCreateNote,
    controller,
    editingCodeBlockId,
    editingNoteElementId,
    insertNoteAt,
    setEditingCodeBlockId,
    startNoteEditing,
    surfaceRef,
    viewModeEnabled,
  ]);

  return {
    onPointerMoveCapture,
    onPointerLeave: clearFlowchartHover,
    onPointerDownCapture,
    onContextMenuCapture,
    onDoubleClickCapture,
  };
}
