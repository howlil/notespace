import {
  CaptureUpdateAction,
  getCommonBounds,
  reconcileElements,
  sceneCoordsToViewportCoords,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, type MutableRefObject, type RefObject } from "react";
import type { Snapshot } from "../../../entities/workspace";
import { duplicatedNoteInstanceIds } from "../../../entities/note";
import type { CanvasContextualAnchor } from "../chrome/CanvasBottomChrome";
import {
  DIAGRAM_DATA_KEY,
  emptyDiagramSelection,
  readStructuredDiagrams,
  selectionForElements,
  syncDiagramsFromElements,
  type DiagramSelection,
  type StructuredDiagram,
} from "../objects/diagram/model/diagram";
import { isDiagramNodeRenderGroupId } from "../objects/diagram/palette/eraser-icons";
import type { CanvasController } from "./canvas-controller";
import { CANVAS_RESIZE_ADAPTERS } from "./canvas-object-registry";
import {
  captureObjectGeometryMap,
  codeOverlayElements,
  deriveCanvasElementState,
  persistedAppState,
  sameElementVersions,
  sceneSignature,
} from "./canvas-scene-state";
import { mergeDiagramHistory, mergeDiagramSets } from "./canvas-state";
import { useCanvasPeerChannel } from "./sync/use-canvas-peer-channel";

type CanvasInteractionState = AppState & {
  selectedElementsAreBeingDragged?: boolean;
  isResizing?: boolean;
  isRotating?: boolean;
  resizingElement?: unknown;
  selectedLinearElement?: { isEditing?: boolean } | null;
};

function isCanvasObjectManipulating(state: AppState) {
  const interaction = state as CanvasInteractionState;
  return Boolean(
    interaction.selectedElementsAreBeingDragged
    || interaction.isResizing
    || interaction.isRotating
    || interaction.resizingElement
    || interaction.selectedLinearElement?.isEditing
    || state.editingTextElement,
  );
}

function selectionContextualAnchor(
  elements: readonly OrderedExcalidrawElement[],
  state: AppState,
  selectedIds: readonly string[],
): CanvasContextualAnchor | null {
  const selected = elements.filter((element) => selectedIds.includes(element.id) && !element.isDeleted);
  if (selected.length === 0) return null;
  const [minX, minY, maxX, maxY] = getCommonBounds(selected);
  const topLeft = sceneCoordsToViewportCoords({ sceneX: minX, sceneY: minY }, state);
  const bottomRight = sceneCoordsToViewportCoords({ sceneX: maxX, sceneY: maxY }, state);
  return {
    left: Math.min(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    right: Math.max(topLeft.x, bottomRight.x),
    bottom: Math.max(topLeft.y, bottomRight.y),
  };
}

export function useCanvasExcalidrawBridge({
  controller,
  initial,
  workspaceId,
  canvasApi,
  setCanvasApi,
  apiRef,
  surfaceRef,
  lastContextPointRef,
  codeGeometryRef,
  expectedAutoFitHeightRef,
  lastRef,
  lastExternalSceneRef,
  diagramsRef,
  diagramHistoryRef,
  nativeNoteCopiesRef,
  updateDiagramState,
  updateDiagramSelection,
  setLastDiagramId,
  syncFlowchartSelection,
  restoreLocalFiles,
  persistCanvasFiles,
  reportCanvasAssetError,
  onChange,
}: {
  controller: CanvasController;
  initial: Snapshot;
  workspaceId: string;
  canvasApi: ExcalidrawImperativeAPI | null;
  setCanvasApi: (api: ExcalidrawImperativeAPI | null) => void;
  apiRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  lastContextPointRef: MutableRefObject<{ x: number; y: number } | null>;
  codeGeometryRef: MutableRefObject<ReturnType<typeof captureObjectGeometryMap>>;
  expectedAutoFitHeightRef: MutableRefObject<Map<string, number>>;
  lastRef: MutableRefObject<string>;
  lastExternalSceneRef: MutableRefObject<string>;
  diagramsRef: MutableRefObject<StructuredDiagram[]>;
  diagramHistoryRef: MutableRefObject<StructuredDiagram[]>;
  nativeNoteCopiesRef: MutableRefObject<((elements: readonly OrderedExcalidrawElement[], state: AppState, copyIds: string[]) => void) | null>;
  updateDiagramState: (next: StructuredDiagram[]) => void;
  updateDiagramSelection: (next: DiagramSelection) => void;
  setLastDiagramId: (id: string | null) => void;
  syncFlowchartSelection: (elements: readonly OrderedExcalidrawElement[], state: AppState, selectedIds: readonly string[], singleNodeId: string | null) => void;
  restoreLocalFiles: (api: ExcalidrawImperativeAPI) => Promise<void>;
  persistCanvasFiles: (files: BinaryFiles, referencedFileIds: string[]) => void;
  reportCanvasAssetError: (message: string) => void;
  onChange: (snapshot: Snapshot) => void;
}) {
  useEffect(() => {
    if (!canvasApi) return;
    controller.setScene({
      nativeContextMenuOpen: Boolean(canvasApi.getAppState().contextMenu),
      viewModeEnabled: canvasApi.getAppState().viewModeEnabled,
    });
    const unsubscribeMenu = canvasApi.onStateChange("contextMenu", (menu) => {
      if (menu) {
        const selectedIds = Object.entries(canvasApi.getAppState().selectedElementIds)
          .filter(([, selected]) => selected)
          .map(([id]) => id);
        const rect = surfaceRef.current?.getBoundingClientRect();
        const point = lastContextPointRef.current ?? {
          x: (rect?.left ?? 0) + menu.left,
          y: (rect?.top ?? 0) + menu.top,
        };
        canvasApi.updateScene({ appState: { contextMenu: null }, captureUpdate: CaptureUpdateAction.NEVER });
        controller.setScene({ nativeContextMenuOpen: false });
        controller.setSelection({
          selectedElementCount: selectedIds.length,
          selectedElementId: selectedIds.length === 1 ? selectedIds[0]! : null,
        });
        controller.openContextMenu(point);
        return;
      }
      controller.setScene({ nativeContextMenuOpen: false });
    });
    const unsubscribeView = canvasApi.onStateChange("viewModeEnabled", (viewModeEnabled) => {
      controller.setScene({ viewModeEnabled });
    });
    const closeNativeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !canvasApi.getAppState().contextMenu) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      canvasApi.updateScene({ appState: { contextMenu: null }, captureUpdate: CaptureUpdateAction.NEVER });
      surfaceRef.current?.querySelector<HTMLElement>(".excalidraw")?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", closeNativeMenuOnEscape, true);
    return () => {
      unsubscribeMenu();
      unsubscribeView();
      window.removeEventListener("keydown", closeNativeMenuOnEscape, true);
    };
  }, [canvasApi, controller, lastContextPointRef, surfaceRef]);

  const handlePeerSnapshot = useCallback((snapshot: Snapshot) => {
    const value = apiRef.current;
    if (!value) return;
    const remoteElements = Array.isArray(snapshot.data.elements)
      ? snapshot.data.elements as OrderedExcalidrawElement[]
      : [];
    const localElements = value.getSceneElementsIncludingDeleted();
    const mergedElements = reconcileElements(
      localElements,
      remoteElements as Parameters<typeof reconcileElements>[1],
      value.getAppState(),
    );

    const localAppState = persistedAppState(value.getAppState());
    const seedDiagrams = mergeDiagramSets(diagramsRef.current, readStructuredDiagrams(snapshot.data));
    diagramHistoryRef.current = mergeDiagramHistory(diagramHistoryRef.current, seedDiagrams);
    const nextDiagrams = syncDiagramsFromElements(diagramHistoryRef.current, mergedElements);
    const data = {
      elements: mergedElements,
      appState: localAppState,
      files: {},
      [DIAGRAM_DATA_KEY]: nextDiagrams,
    };
    const serialized = JSON.stringify(data);
    if (serialized === lastRef.current) return;

    lastRef.current = serialized;
    lastExternalSceneRef.current = serialized;
    updateDiagramState(nextDiagrams);
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    codeGeometryRef.current = captureObjectGeometryMap(mergedElements, CANVAS_RESIZE_ADAPTERS);
    expectedAutoFitHeightRef.current.clear();
    controller.setScene({
      hasElements: mergedElements.some((element) => !element.isDeleted),
      overlayElements: codeOverlayElements(mergedElements, CANVAS_RESIZE_ADAPTERS),
    });

    value.updateScene({ elements: mergedElements, captureUpdate: CaptureUpdateAction.NEVER });
    onChange({ format: "excalidraw", version: 1, data });
  }, [
    apiRef,
    codeGeometryRef,
    controller,
    diagramHistoryRef,
    diagramsRef,
    expectedAutoFitHeightRef,
    lastExternalSceneRef,
    lastRef,
    onChange,
    setLastDiagramId,
    updateDiagramState,
  ]);

  const publishPeerSnapshot = useCanvasPeerChannel(workspaceId, handlePeerSnapshot);

  const emitSnapshot = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, nextDiagrams: readonly StructuredDiagram[]) => {
    const data = {
      elements,
      appState: persistedAppState(state),
      files: {},
      [DIAGRAM_DATA_KEY]: nextDiagrams,
    };
    const snapshot: Snapshot = { format: "excalidraw", version: 1, data };
    const serialized = JSON.stringify(data);
    lastRef.current = serialized;
    lastExternalSceneRef.current = serialized;
    onChange(snapshot);
    publishPeerSnapshot(snapshot);
  }, [lastExternalSceneRef, lastRef, onChange, publishPeerSnapshot]);

  useEffect(() => {
    if (!apiRef.current) return;
    const signature = sceneSignature(initial.data);
    if (signature === lastExternalSceneRef.current) return;
    const elements = Array.isArray(initial.data.elements) ? initial.data.elements as OrderedExcalidrawElement[] : [];
    const nextDiagrams = readStructuredDiagrams(initial.data);
    diagramHistoryRef.current = nextDiagrams;
    updateDiagramState(nextDiagrams);
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    codeGeometryRef.current = captureObjectGeometryMap(elements, CANVAS_RESIZE_ADAPTERS);
    expectedAutoFitHeightRef.current.clear();
    controller.setScene({
      elements,
      overlayElements: codeOverlayElements(elements, CANVAS_RESIZE_ADAPTERS),
      hasElements: elements.length > 0,
    });
    apiRef.current.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    lastExternalSceneRef.current = signature;
    void restoreLocalFiles(apiRef.current).catch((error: unknown) => {
      reportCanvasAssetError(error instanceof Error ? error.message : "Could not load Canvas images.");
    });
  }, [
    apiRef,
    codeGeometryRef,
    controller,
    diagramHistoryRef,
    expectedAutoFitHeightRef,
    initial,
    lastExternalSceneRef,
    reportCanvasAssetError,
    restoreLocalFiles,
    setLastDiagramId,
    updateDiagramState,
  ]);

  const changed = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, files: BinaryFiles) => {
    if (state.editingGroupId && isDiagramNodeRenderGroupId(state.editingGroupId)) {
      const groupId = state.editingGroupId;
      const groupMembers = elements.filter((element) => !element.isDeleted && element.groupIds.includes(groupId));
      const nextSelectedIds = Object.fromEntries(groupMembers.map((element) => [element.id, true as const]));
      apiRef.current?.updateScene({
        appState: {
          editingGroupId: null,
          editingTextElement: null,
          selectedElementIds: nextSelectedIds,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      return;
    }

    const manipulating = isCanvasObjectManipulating(state);
    const selectedIds = Object.entries(state.selectedElementIds).filter(([, value]) => value).map(([id]) => id);
    const selected = selectedIds[0] ?? null;
    const selectionStyleKey = elements.filter((element) => state.selectedElementIds[element.id]).map((element) => `${element.id}:${element.version}`).join("|") + JSON.stringify([
      state.currentItemStrokeColor, state.currentItemBackgroundColor, state.currentItemStrokeWidthKey,
      state.currentItemFillStyle, state.currentItemOpacity, state.currentItemStrokeVariability,
      state.currentItemStrokeStyle, state.currentItemRoughness, state.currentItemRoundness,
      state.currentItemStartArrowhead, state.currentItemEndArrowhead,
      state.currentItemFontFamily, state.currentItemFontSize, state.currentItemTextAlign,
    ]);

    controller.setViewport({ zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY });
    controller.setSelection({
      selectedElementId: selected,
      selectedElementCount: selectedIds.length,
      selectionKey: [...selectedIds].sort().join(","),
      selectionStyleKey,
      selectionAnchor: selectionContextualAnchor(elements, state, selectedIds),
      isManipulating: manipulating,
      isMarqueeSelecting: Boolean(state.selectionElement),
    });

    const {
      authoredElements,
      codeElements: nextCodeElements,
      codeGeometry,
      acknowledgedAutoFitIds,
      normalizedManualResize,
      hasLiveElements,
    } = deriveCanvasElementState(
      elements,
      codeGeometryRef.current,
      expectedAutoFitHeightRef.current,
      CANVAS_RESIZE_ADAPTERS,
      manipulating,
    );
    for (const elementId of acknowledgedAutoFitIds) expectedAutoFitHeightRef.current.delete(elementId);
    codeGeometryRef.current = codeGeometry;

    const currentScene = controller.scene.getSnapshot();
    controller.setScene({
      elements: sameElementVersions(currentScene.elements, authoredElements) ? currentScene.elements : authoredElements,
      overlayElements: sameElementVersions(currentScene.overlayElements, nextCodeElements) ? currentScene.overlayElements : nextCodeElements,
      hasElements: hasLiveElements,
      activeTool: state.activeTool.type,
      gridModeEnabled: state.gridModeEnabled,
      objectsSnapModeEnabled: state.objectsSnapModeEnabled,
      backgroundColor: state.viewBackgroundColor,
    });

    if (normalizedManualResize) {
      apiRef.current?.updateScene({ elements: authoredElements, captureUpdate: CaptureUpdateAction.NEVER });
    }

    const hasStructuredDiagrams = diagramHistoryRef.current.length > 0;
    const nextDiagrams = hasStructuredDiagrams
      ? syncDiagramsFromElements(diagramHistoryRef.current, authoredElements)
      : [];
    const nextDiagramSelection = hasStructuredDiagrams
      ? selectionForElements(nextDiagrams, selectedIds, authoredElements)
      : emptyDiagramSelection();
    if (hasStructuredDiagrams) updateDiagramState(nextDiagrams);
    updateDiagramSelection(nextDiagramSelection);

    syncFlowchartSelection(
      authoredElements,
      state,
      selectedIds,
      nextDiagramSelection.nodeIds.length === 1 ? nextDiagramSelection.nodeIds[0] : null,
    );

    const copiedNoteElementIds = duplicatedNoteInstanceIds(authoredElements);
    if (copiedNoteElementIds.length) {
      nativeNoteCopiesRef.current?.(authoredElements, state, copiedNoteElementIds);
      return;
    }
    const data = {
      elements: authoredElements,
      appState: persistedAppState(state),
      files: {},
      [DIAGRAM_DATA_KEY]: nextDiagrams,
    };
    const referencedFileIds = authoredElements.flatMap((element) =>
      !element.isDeleted && "fileId" in element && element.fileId ? [String(element.fileId)] : []);
    persistCanvasFiles(files, referencedFileIds);
    const serialized = JSON.stringify(data);
    if (serialized === lastRef.current) return;
    const first = lastRef.current === "";
    lastRef.current = serialized;
    lastExternalSceneRef.current = serialized;
    if (!first) {
      const snapshot: Snapshot = { format: "excalidraw", version: 1, data };
      onChange(snapshot);
      publishPeerSnapshot(snapshot);
    }
  }, [
    apiRef,
    codeGeometryRef,
    controller,
    diagramHistoryRef,
    expectedAutoFitHeightRef,
    lastExternalSceneRef,
    lastRef,
    nativeNoteCopiesRef,
    onChange,
    persistCanvasFiles,
    publishPeerSnapshot,
    syncFlowchartSelection,
    updateDiagramSelection,
    updateDiagramState,
  ]);

  const onInitialize = useCallback((value: ExcalidrawImperativeAPI) => {
    apiRef.current = value;
    controller.attachApi(value);
    setCanvasApi(value);
    const state = value.getAppState();
    controller.setViewport({ zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY });
    const initializedElements = value.getSceneElementsIncludingDeleted();
    codeGeometryRef.current = captureObjectGeometryMap(initializedElements, CANVAS_RESIZE_ADAPTERS);
    controller.setScene({
      elements: initializedElements,
      overlayElements: codeOverlayElements(initializedElements, CANVAS_RESIZE_ADAPTERS),
      gridModeEnabled: state.gridModeEnabled,
      objectsSnapModeEnabled: state.objectsSnapModeEnabled,
    });
    void restoreLocalFiles(value);
  }, [apiRef, codeGeometryRef, controller, restoreLocalFiles, setCanvasApi]);

  return { onInitialize, changed, emitSnapshot };
}
