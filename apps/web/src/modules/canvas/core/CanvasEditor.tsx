import {
  CaptureUpdateAction,
  Excalidraw,
  sceneCoordsToViewportCoords,
  serializeAsJSON,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../../entities/workspace";
import { readCanvasNoteReference, type NoteDocument } from "../../../entities/note";
import type { CreateNoteInstanceRequest, CreateNoteInstanceResult, Note } from "../../../platform/api/note-api";
import { useToast } from "../../../shared/ui/feedback/toast-provider";
import { DEFAULT_THEME_PALETTE, paletteCanvasColor, type ThemePalette } from "../../../shared/ui/theme/theme-model";
import { useStore } from "../../../shared/lib/use-store";
import { NotePickerPopover, type CanvasNoteStore } from "../../note-editor";
import { readStoredLibraryItems, writeStoredLibraryItems } from "./assets/canvas-library";
import { useCanvasAssets } from "./assets/use-canvas-assets";
import { executeNativeAction } from "./excalidraw-bridge/CanvasNativeActions";
import { useCanvasPinch } from "./viewport/use-canvas-pinch";
import { mergeDiagramHistory, sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state";
import {
  captureObjectGeometryMap,
  canvasBackgroundColor,
  codeOverlayElements,
  sceneSignature,
} from "./canvas-scene-state";
import { createCanvasController, isOverlayBlockingCanvas } from "./canvas-controller";
import { CanvasControllerProvider } from "./CanvasControllerContext";
import { CANVAS_RESIZE_ADAPTERS, decorateDirectionalSpawnWithPlugins } from "./canvas-object-registry";
import { useCanvasExcalidrawBridge } from "./use-canvas-excalidraw-bridge";
import { useCanvasExportBridge } from "./use-canvas-export-bridge";
import { useCanvasSurfaceEvents } from "./use-canvas-surface-events";
import { CanvasOverlayLayers } from "./CanvasOverlayLayers";
import { CanvasBottomChrome } from "../chrome/CanvasBottomChrome";
import { CanvasToolRail } from "../chrome/CanvasToolRail";
import { CanvasViewControls } from "../chrome/CanvasViewControls";
import { CanvasObjectContextMenu } from "../selection/CanvasObjectContextMenu";
import { CanvasSelectionActions, type CanvasRuntimeActionName } from "../selection/CanvasSelectionActions";
import { CodeBlockContextMenu } from "../objects/code-block/CodeBlockContextMenu";
import { useCanvasCodeBlocks } from "../objects/code-block/use-canvas-code-blocks";
import { DiagramPalette } from "../objects/diagram/palette/DiagramPalette";
import { DiagramNodeQuickPicker } from "../objects/diagram/palette/DiagramNodeQuickPicker";
import {
  DIAGRAM_DATA_KEY,
  emptyDiagramSelection,
  readStructuredDiagrams,
  type DiagramSelection,
  type StructuredDiagram,
} from "../objects/diagram/model/diagram";
import { useCanvasDiagramCommands } from "../objects/diagram/use-canvas-diagram-commands";
import { type DirectionalSpawnDirection } from "../objects/flowchart/CanvasDirectionalSpawn";
import { CanvasFlowchartHandles } from "../objects/flowchart/CanvasFlowchartHandles";
import { useCanvasFlowchart } from "../objects/flowchart/use-canvas-flowchart";
import { NoteCardContextMenu, type CanvasContextMenuNoteProps } from "../objects/note-card/NoteCardContextMenu";
import { useCanvasNotes } from "../objects/note-card/use-canvas-notes";

const canvasUIOptions = {
  canvasActions: {
    loadScene: true,
    saveToActiveFile: false,
    export: { saveFileToDisk: true },
    toggleTheme: false,
    saveAsImage: true,
  },
  tools: { image: true },
};

declare global {
  interface Window { EXCALIDRAW_ASSET_PATH: string; }
}

type CanvasEditorProps = {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  focusNoteId?: string;
  focusBlockId?: string;
  focusNonce?: string;
  dark: boolean;
  palette?: ThemePalette;
  workspaceId: string;
  canvasVersion: number;
  noteStore?: CanvasNoteStore;
  fullMode?: boolean;
  onToggleFullMode?: () => void;
  onRegisterNotePlacer?: (placer: (noteId: string) => Promise<void> | void) => (() => void) | void;
  onCreateNote?: (request: CreateNoteInstanceRequest) => Promise<CreateNoteInstanceResult>;
  onUpdateNote?: (noteId: string, document: Note["document"], expectedRevision: number) => Promise<Note>;
  onDeleteNoteInstance?: (workspaceId: string, instanceId: string, canvas: Snapshot, expectedCanvasVersion: number) => Promise<{ canvas: Snapshot; version: number; updatedAt: string }>;
  onRegisterAuthoringFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onRegisterCanvasExport?: (read: () => string) => (() => void) | void;
};

export default function CanvasEditor({
  initial, onChange, focusNoteId, focusBlockId, focusNonce, dark, palette = DEFAULT_THEME_PALETTE, workspaceId,
  canvasVersion, noteStore, fullMode = false, onToggleFullMode, onRegisterNotePlacer, onCreateNote, onUpdateNote, onDeleteNoteInstance, onRegisterAuthoringFlush, onRegisterCanvasExport,
}: CanvasEditorProps) {
  const { showToast } = useToast();
  const defaultCanvasBg = paletteCanvasColor(palette, dark);
  useEffect(() => {
    if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
  }, []);

  const [initialData] = useState(() => {
    const data = { ...initial.data };
    delete data.files;
    delete data[DIAGRAM_DATA_KEY];
    return {
      ...data,
      appState: { viewBackgroundColor: defaultCanvasBg, ...(initial.data.appState as object) },
      files: {},
    } as ExcalidrawInitialDataState;
  });

  const [controller] = useState(() => {
    const initialElements = Array.isArray(initial.data.elements) ? initial.data.elements as OrderedExcalidrawElement[] : [];
    return createCanvasController({
      elements: initialElements,
      overlayElements: codeOverlayElements(initialElements, CANVAS_RESIZE_ADAPTERS),
      backgroundColor: canvasBackgroundColor(initial.data, defaultCanvasBg),
    });
  });

  // Subscribe to coarse scene/selection/overlay slices — camera viewport pan/zoom stays isolated inside CanvasOverlayLayers!
  const sceneState = useStore(controller.scene);
  const selectionState = useStore(controller.selection);
  const overlay = useStore(controller.overlay);

  const [trashNoteId, setTrashNoteId] = useState<string | null>(null);
  const [highlightedBlock, setHighlightedBlock] = useState<{ noteId: string; blockId: string } | null>(null);
  const [diagrams, setDiagrams] = useState(() => readStructuredDiagrams(initial.data));
  const diagramsRef = useRef(diagrams);
  const diagramHistoryRef = useRef(diagrams);
  const [diagramSelection, setDiagramSelection] = useState<DiagramSelection>(() => emptyDiagramSelection());
  const diagramSelectionRef = useRef(diagramSelection);
  const [lastDiagramId, setLastDiagramId] = useState<string | null>(() => diagrams.at(-1)?.id ?? null);
  const [canvasApi, setCanvasApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const noteDocumentsGetterRef = useRef<() => Record<string, NoteDocument>>(() => ({}));
  const registerNoteDocuments = useCallback((read: () => Record<string, NoteDocument>) => {
    noteDocumentsGetterRef.current = read;
    return () => {
      if (noteDocumentsGetterRef.current === read) noteDocumentsGetterRef.current = () => ({});
    };
  }, []);
  const readNoteDocuments = useCallback(() => noteDocumentsGetterRef.current(), []);

  const codeGeometryRef = useRef(captureObjectGeometryMap(sceneState.elements, CANVAS_RESIZE_ADAPTERS));
  const expectedAutoFitHeightRef = useRef(new Map<string, number>());
  const nativeNoteCopiesRef = useRef<((elements: readonly OrderedExcalidrawElement[], state: AppState, copyIds: string[]) => void) | null>(null);
  const lastContextPointRef = useRef<{ x: number; y: number } | null>(null);
  const diagramAnchorRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastExternalScene = useRef(sceneSignature(initial.data));

  useHandleLibrary({ excalidrawAPI: canvasApi, getInitialLibraryItems: readStoredLibraryItems });

  const diagramOpen = overlay.kind === "tool-popover" && overlay.panel === "diagram";
  const toolSettingsOpen = overlay.kind === "tool-settings";
  const editingCodeBlockId = overlay.kind === "editing-code" ? overlay.elementId : null;
  const editingNoteElementId = overlay.kind === "editing-note" ? overlay.elementId : null;
  const notePickerOpen = overlay.kind === "note-picker";
  const objectContextMenu = overlay.kind === "context-menu" ? overlay.point : null;
  const quickPickerTarget = overlay.kind === "diagram-quick-picker" ? overlay.target : null;

  const setEditingCodeBlockId = useCallback((id: string | null) => {
    controller.setOverlay(id ? { kind: "editing-code", elementId: id } : { kind: "none" });
  }, [controller]);
  const setEditingNoteElementId = useCallback((id: string | null) => {
    controller.setOverlay(id ? { kind: "editing-note", elementId: id } : { kind: "none" });
  }, [controller]);
  const setExpandedNoteElementId = useCallback((id: string | null) => {
    controller.setOverlay(id ? { kind: "expanded-note", elementId: id } : { kind: "none" });
  }, [controller]);
  const setInfoNoteId = useCallback((noteId: string | null) => {
    controller.setOverlay(noteId ? { kind: "note-info", noteId } : { kind: "none" });
  }, [controller]);
  const setNotePickerOpen = useCallback((open: boolean) => {
    controller.setOverlay(open ? { kind: "note-picker" } : { kind: "none" });
  }, [controller]);

  const setSceneElements = useCallback((elements: readonly OrderedExcalidrawElement[]) => {
    controller.setScene({ elements });
  }, [controller]);
  const setOverlayElements = useCallback((overlayElements: readonly OrderedExcalidrawElement[]) => {
    controller.setScene({ overlayElements });
  }, [controller]);
  const setHasElements = useCallback((hasElements: boolean) => {
    controller.setScene({ hasElements });
  }, [controller]);
  const setSelectedElementCount = useCallback((selectedElementCount: number) => {
    controller.setSelection({ selectedElementCount });
  }, [controller]);
  const setSelectedElementId = useCallback((selectedElementId: string | null) => {
    controller.setSelection({ selectedElementId });
  }, [controller]);

  const toggleFullMode = useCallback(() => { onToggleFullMode?.(); }, [onToggleFullMode]);
  const closeCanvasPopovers = useCallback(() => { controller.closeOverlays(); }, [controller]);
  const closeSelectionOverlay = useCallback(() => {
    if (controller.overlay.getSnapshot().kind === "selection-panel") controller.closeOverlays();
  }, [controller]);

  const reportCanvasAssetError = useCallback((message: string) => {
    showToast({ kind: "error", message });
  }, [showToast]);
  const reportCanvasSuccess = useCallback((message: string) => {
    showToast({ kind: "success", message });
  }, [showToast]);

  const {
    restoreFiles: restoreLocalFiles,
    persistFiles: persistCanvasFiles,
    flushPendingAssets,
  } = useCanvasAssets({ initial, workspaceId, onError: reportCanvasAssetError });

  useEffect(() => {
    if (!canvasApi) return;
    return onRegisterCanvasExport?.(() => serializeAsJSON(
      canvasApi.getSceneElementsIncludingDeleted(), canvasApi.getAppState(), canvasApi.getFiles(), "local",
    ));
  }, [canvasApi, onRegisterCanvasExport]);

  const spawnedNoteRef = useRef<((source: OrderedExcalidrawElement, target: OrderedExcalidrawElement) => Promise<void>) | null>(null);
  const handleSpawnedShape = useCallback((source: OrderedExcalidrawElement, target: OrderedExcalidrawElement) => {
    if (readCanvasNoteReference(source)) void spawnedNoteRef.current?.(source, target);
  }, []);

  const {
    anchor: flowchartAnchor,
    activeDirection: flowchartActiveDirection,
    previewDirection: flowchartPreviewDirection,
    trackPointer: trackFlowchartPointer,
    clearHover: clearFlowchartHover,
    beginPreview: beginNativeFlowchartPreview,
    cancelPreview: cancelNativeFlowchartPreview,
    commitPreview: commitNativeFlowchartPreview,
    syncSelection: syncFlowchartSelection,
    focusEditor: focusCanvasEditor,
  } = useCanvasFlowchart({
    apiRef: api,
    surfaceRef,
    decorateTarget: decorateDirectionalSpawnWithPlugins,
    onSpawned: handleSpawnedShape,
  });

  const canvasOverlayInteractionActive = isOverlayBlockingCanvas(overlay, {
    contextualInteractionActive: false,
    nativeContextMenuOpen: sceneState.nativeContextMenuOpen,
    viewModeEnabled: sceneState.viewModeEnabled,
  });

  useEffect(() => {
    if (selectionState.isManipulating && (overlay.kind === "context-menu" || overlay.kind === "tool-settings")) {
      controller.closeOverlays();
    }
  }, [controller, overlay.kind, selectionState.isManipulating]);

  useEffect(() => {
    if (sceneState.viewModeEnabled && overlay.kind === "tool-settings") {
      controller.closeOverlays();
    }
  }, [controller, overlay.kind, sceneState.viewModeEnabled]);

  useEffect(() => {
    if (canvasOverlayInteractionActive) cancelNativeFlowchartPreview();
  }, [cancelNativeFlowchartPreview, canvasOverlayInteractionActive]);

  const updateDiagramState = useCallback((next: StructuredDiagram[]) => {
    diagramHistoryRef.current = mergeDiagramHistory(diagramHistoryRef.current, next);
    if (sameStructuredDiagrams(diagramsRef.current, next)) return;
    diagramsRef.current = next;
    setDiagrams(next);
  }, []);

  const updateDiagramSelection = useCallback((next: DiagramSelection) => {
    if (sameDiagramSelection(diagramSelectionRef.current, next)) return;
    diagramSelectionRef.current = next;
    setDiagramSelection(next);
  }, []);

  const persistLibraryItems = useCallback((items: LibraryItems) => {
    if (!writeStoredLibraryItems(items)) {
      showToast({ kind: "error", message: "Could not persist the Excalidraw library in this browser." });
    }
  }, [showToast]);

  const { onInitialize, changed, emitSnapshot } = useCanvasExcalidrawBridge({
    controller,
    initial,
    workspaceId,
    canvasApi,
    setCanvasApi,
    apiRef: api,
    surfaceRef,
    lastContextPointRef,
    codeGeometryRef,
    expectedAutoFitHeightRef,
    lastRef: last,
    lastExternalSceneRef: lastExternalScene,
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
  });

  const focusNoteOnCanvas = useCallback((noteId: string, blockId?: string) => {
    if (!canvasApi) return;
    const element = canvasApi.getSceneElements().find((candidate) => readCanvasNoteReference(candidate)?.noteId === noteId && !candidate.isDeleted);
    if (!element) return;
    controller.closeOverlays();
    controller.setSelection({ selectedElementCount: 1, selectedElementId: element.id });
    canvasApi.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    canvasApi.setViewport({ target: element, fit: "scale-down", animation: { duration: 250 } });
    setHighlightedBlock(blockId ? { noteId, blockId } : null);
  }, [canvasApi, controller]);

  useEffect(() => {
    if (!focusNoteId || !canvasApi) return;
    focusNoteOnCanvas(focusNoteId, focusBlockId);
  }, [canvasApi, focusBlockId, focusNonce, focusNoteId, focusNoteOnCanvas]);

  useEffect(() => {
    if (!highlightedBlock) return;
    const timer = window.setTimeout(() => setHighlightedBlock(null), 2400);
    return () => window.clearTimeout(timer);
  }, [highlightedBlock]);

  const {
    noteActivationPoint,
    startNoteEditing,
    finishNoteEditing,
    insertNote,
    insertNoteAt,
    spawnConnectedNote,
    placeLinkedNote,
    deleteSelectedNote,
    removeMissingNote,
    duplicateSelectedNote,
    toggleFoldNote,
    setNoteColor,
    setNoteShape,
    fitNoteContent,
    resizeNote,
    resolveNativeNoteCopies,
    registerNoteFlush,
    flushNotes,
  } = useCanvasNotes({
    apiRef: api,
    surfaceRef,
    workspaceId,
    dark,
    canvasVersion,
    diagrams,
    diagramsRef,
    expectedAutoFitHeightRef,
    lastRef: last,
    lastExternalSceneRef: lastExternalScene,
    sceneElements: sceneState.elements,
    selectedElementId: selectionState.selectedElementId,
    selectedElementCount: selectionState.selectedElementCount,
    editingNoteElementId,
    canvasOverlayInteractionActive,
    viewModeEnabled: sceneState.viewModeEnabled,
    onCreateNote,
    onDeleteNoteInstance,
    onExpandNote: setExpandedNoteElementId,
    onOpenNotePicker: onCreateNote ? () => setNotePickerOpen(true) : undefined,
    setSceneElements,
    setOverlayElements,
    setHasElements,
    setSelectedElementCount,
    setSelectedElementId,
    setEditingNoteElementId,
    focusCanvasEditor,
    emitSnapshot,
    showToast,
  });
  nativeNoteCopiesRef.current = resolveNativeNoteCopies;
  spawnedNoteRef.current = spawnConnectedNote;

  useEffect(() => onRegisterAuthoringFlush?.(async () => {
    await flushPendingAssets();
    await flushNotes();
  }), [flushNotes, flushPendingAssets, onRegisterAuthoringFlush]);

  const runCanvasAction = useCallback((name: CanvasRuntimeActionName) => {
    const value = api.current;
    if (!value) return;
    if (name === "deleteSelectedElements" && deleteSelectedNote()) return;
    if (name === "duplicateSelection" && duplicateSelectedNote()) return;
    if (name === "imageExport") {
      value.app.setOpenDialog({ name: "imageExport" });
      return;
    }
    if (name === "commandPalette") {
      value.updateScene({ appState: { openSidebar: null, openDialog: { name: "commandPalette" } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return;
    }
    if (name === "searchMenu") {
      const openSidebar = value.getAppState().openSidebar;
      const isSearchOpen = openSidebar?.name === "default" && openSidebar.tab === "search";
      value.toggleSidebar({ name: "default", tab: "search", force: !isSearchOpen });
      return;
    }
    if (executeNativeAction(value, name)) return;
    showToast({ kind: "error", message: `Canvas action “${name}” is not available in this Excalidraw build.` });
  }, [deleteSelectedNote, duplicateSelectedNote, showToast]);

  const {
    codeBlockViews,
    codeRuns,
    runCodeBlock,
    updateCodeBlock,
    autoFitCodeBlock,
    insertCodeBlock,
    selectedCodeMenuProps,
  } = useCanvasCodeBlocks({
    apiRef: api,
    surfaceRef,
    expectedAutoFitHeightRef,
    overlayElements: sceneState.overlayElements,
    selectedElementId: selectionState.selectedElementId,
    selectedElementCount: selectionState.selectedElementCount,
    editingCodeBlockId,
    dark,
    onEditingChange: setEditingCodeBlockId,
    onSelectElement: setSelectedElementId,
    onOverlayElementsChange: setOverlayElements,
    onHasElementsChange: setHasElements,
    onRunCanvasAction: runCanvasAction,
  });

  useCanvasExportBridge({
    canvasApi,
    apiRef: api,
    dark,
    codeBlockViews,
    readNoteDocuments,
    showToast,
  });

  const {
    activeDiagram,
    selectedNodeLabel,
    selectedEdgeLabel,
    selectedGroupLabel,
    insertNode,
    connectSelected,
    groupSelected,
    renameSelectedNode,
    replaceNodeSpec,
    renameSelectedEdge,
    deleteSelectedEdge,
    renameSelectedGroup,
    ungroupSelected,
    autoLayout,
    detachDiagram,
    spawnSelected: spawnSelectedDiagramNode,
  } = useCanvasDiagramCommands({
    apiRef: api,
    surfaceRef,
    workspaceId,
    dark,
    diagrams,
    diagramsRef,
    diagramHistoryRef,
    diagramSelection,
    lastDiagramId,
    setLastDiagramId,
    updateDiagramState,
    updateDiagramSelection,
    emitSnapshot,
    onError: reportCanvasAssetError,
    onSuccess: reportCanvasSuccess,
  });

  const spawnDiagramBranch = useCallback((direction: DirectionalSpawnDirection) => {
    const spawned = spawnSelectedDiagramNode(direction);
    if (!spawned) return false;
    const value = api.current;
    if (value) {
      const state = value.getAppState();
      const topLeft = sceneCoordsToViewportCoords({ sceneX: spawned.node.x, sceneY: spawned.node.y }, state);
      const bottomRight = sceneCoordsToViewportCoords({ sceneX: spawned.node.x + spawned.node.width, sceneY: spawned.node.y + spawned.node.height + 24 }, state);
      controller.setOverlay({
        kind: "diagram-quick-picker",
        target: {
          nodeId: spawned.nodeId,
          rect: {
            left: Math.min(topLeft.x, bottomRight.x),
            top: Math.min(topLeft.y, bottomRight.y),
            right: Math.max(topLeft.x, bottomRight.x),
            bottom: Math.max(topLeft.y, bottomRight.y),
          },
        },
      });
    }
    return true;
  }, [controller, spawnSelectedDiagramNode]);

  const surfaceHandlers = useCanvasSurfaceEvents({
    controller,
    apiRef: api,
    surfaceRef,
    lastContextPointRef,
    overlayKind: overlay.kind,
    viewModeEnabled: sceneState.viewModeEnabled,
    editingCodeBlockId,
    editingNoteElementId,
    canvasOverlayInteractionActive,
    flowchartPreviewDirection,
    canCreateNote: Boolean(onCreateNote),
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
  });

  useCanvasPinch(surfaceRef, api);

  const currentCanvasNoteIds = useMemo(() => new Set(
    sceneState.elements.flatMap((element) => {
      const reference = readCanvasNoteReference(element);
      return reference ? [reference.noteId] : [];
    }),
  ), [sceneState.elements]);

  useEffect(() => {
    if (sceneState.viewModeEnabled || !onCreateNote || !onRegisterNotePlacer) return;
    return onRegisterNotePlacer((noteId) => placeLinkedNote(noteId));
  }, [onCreateNote, onRegisterNotePlacer, placeLinkedNote, sceneState.viewModeEnabled]);

  const selectedNoteElement = selectionState.selectedElementCount === 1
    ? sceneState.elements.find((element) => element.id === selectionState.selectedElementId && !element.isDeleted)
    : undefined;
  const selectedNoteReference = readCanvasNoteReference(selectedNoteElement);
  const selectedNoteMenuProps: CanvasContextMenuNoteProps | null = selectedNoteElement && selectedNoteReference
    ? {
        folded: selectedNoteReference.compact === true,
        fixedHeight: selectedNoteReference.heightMode === "fixed",
        color: selectedNoteReference.color ?? "default",
        shape: selectedNoteReference.shape ?? "rounded",
        onEdit: () => startNoteEditing(selectedNoteElement.id, null),
        onToggleFold: () => toggleFoldNote(selectedNoteElement.id, selectedNoteReference),
        onColorChange: (color) => setNoteColor(selectedNoteElement.id, color),
        onShapeChange: (shape) => setNoteShape(selectedNoteElement.id, shape),
        onExpand: () => setExpandedNoteElementId(selectedNoteElement.id),
        onOpenInfo: () => setInfoNoteId(selectedNoteReference.noteId),
        onOpenNotePicker: onCreateNote ? () => setNotePickerOpen(true) : undefined,
        onFitContent: () => fitNoteContent(selectedNoteElement.id),
        onPlaceLinked: () => { void placeLinkedNote(selectedNoteReference.noteId); },
        onDuplicate: () => runCanvasAction("duplicateSelection"),
        onTrash: () => setTrashNoteId(selectedNoteReference.noteId),
        onDelete: () => runCanvasAction("deleteSelectedElements"),
      }
    : null;

  return (
    <CanvasControllerProvider controller={controller}>
      <div
        ref={surfaceRef}
        className="notespace-canvas-surface relative h-full min-h-0 w-full"
        data-hide-selection-box={editingNoteElementId !== null || editingCodeBlockId !== null ? "true" : undefined}
        aria-label="Workspace canvas"
        {...surfaceHandlers}
      >
        <CanvasOverlayLayers
          workspaceId={workspaceId}
          noteStore={noteStore}
          dark={dark}
          trashNoteId={trashNoteId}
          noteActivationPoint={noteActivationPoint}
          highlightedBlock={highlightedBlock}
          codeRuns={codeRuns}
          codeBlockViews={codeBlockViews}
          onUpdateCodeBlock={updateCodeBlock}
          onRunCodeBlock={runCodeBlock}
          onAutoFitCodeBlock={autoFitCodeBlock}
          onEditingNoteChange={finishNoteEditing}
          onTrashNoteChange={setTrashNoteId}
          onFocusNote={focusNoteOnCanvas}
          onRegisterNoteFlush={registerNoteFlush}
          onRegisterNoteDocuments={registerNoteDocuments}
          onUpdateNote={onUpdateNote ?? (async () => { throw new Error("Note editing is unavailable."); })}
          onAutoResizeNote={resizeNote}
          onRemoveMissingNote={removeMissingNote}
          onSuccess={reportCanvasSuccess}
          onError={reportCanvasAssetError}
        />
        <CanvasViewControls
          api={canvasApi}
          gridModeEnabled={sceneState.gridModeEnabled}
          objectsSnapModeEnabled={sceneState.objectsSnapModeEnabled}
          onAction={runCanvasAction}
          onToolOverlayOpen={closeCanvasPopovers}
          onOverlayOpen={() => controller.setOverlay({ kind: "view-menu" })}
          overlayActive={overlay.kind === "none" || overlay.kind === "view-menu"}
          toolOverlayOpen={diagramOpen}
        />
        <CanvasBottomChrome
          activeTool={sceneState.activeTool}
          contextualVisible={toolSettingsOpen && !selectionState.isManipulating && !selectionState.isMarqueeSelecting && !sceneState.nativeContextMenuOpen && !objectContextMenu && !sceneState.viewModeEnabled}
          contextual={(
            <CanvasSelectionActions
              api={canvasApi}
              activeTool={sceneState.activeTool}
              isManipulating={selectionState.isManipulating}
              contextMenuOpen={sceneState.nativeContextMenuOpen || objectContextMenu !== null}
              viewModeEnabled={sceneState.viewModeEnabled}
              onOverlayOpen={() => controller.setOverlay({ kind: "selection-panel" })}
              onOverlayClose={closeSelectionOverlay}
              overlayActive={overlay.kind === "none" || overlay.kind === "selection-panel"}
            />
          )}
          tools={(
            <CanvasToolRail
              api={canvasApi}
              diagramAnchorRef={diagramAnchorRef}
              activeTool={sceneState.activeTool}
              diagramOpen={diagramOpen}
              onOverlayOpen={() => controller.setOverlay({ kind: "none" })}
              onDiagramToggle={() => controller.toggleToolPopover("diagram")}
              onCoreToolSelect={closeCanvasPopovers}
              onOpenToolSettings={(type) => {
                const isSameTool = sceneState.activeTool === type;
                if (canvasApi && !isSameTool) {
                  canvasApi.setActiveTool({ type }, { keepSelection: false });
                }
                controller.setOverlay(isSameTool && toolSettingsOpen ? { kind: "none" } : { kind: "tool-settings" });
              }}
              onInsertCodeBlock={insertCodeBlock}
              onInsertNote={() => { void insertNote(); }}
              diagramPanel={(
                <DiagramPalette
                  open={diagramOpen}
                  anchorRef={diagramAnchorRef}
                  activeDiagram={Boolean(activeDiagram)}
                  selectedNodeCount={diagramSelection.nodeIds.length}
                  selectedNodeLabel={selectedNodeLabel}
                  selectedEdgeLabel={selectedEdgeLabel}
                  selectedGroupLabel={selectedGroupLabel}
                  onInsertNode={insertNode}
                  onConnect={connectSelected}
                  onGroup={groupSelected}
                  onRenameNode={renameSelectedNode}
                  onRenameEdge={renameSelectedEdge}
                  onDeleteEdge={deleteSelectedEdge}
                  onRenameGroup={renameSelectedGroup}
                  onUngroup={ungroupSelected}
                  onAutoLayout={autoLayout}
                  onDetach={detachDiagram}
                  onClose={closeCanvasPopovers}
                />
              )}
            />
          )}
        />
        <CanvasFlowchartHandles
          anchor={canvasOverlayInteractionActive ? null : flowchartAnchor}
          activeDirection={canvasOverlayInteractionActive ? null : flowchartActiveDirection}
          previewDirection={flowchartPreviewDirection}
          onPreviewStart={(direction) => {
            if (diagramSelection.nodeIds.length === 1) return;
            beginNativeFlowchartPreview(direction);
          }}
          onPreviewCancel={cancelNativeFlowchartPreview}
          onCommit={(direction) => {
            if (spawnDiagramBranch(direction)) return;
            commitNativeFlowchartPreview(direction);
          }}
        />
        <DiagramNodeQuickPicker
          target={quickPickerTarget}
          onSelect={(nodeId, item) => {
            replaceNodeSpec(nodeId, item);
            focusCanvasEditor();
          }}
          onClose={() => {
            controller.closeOverlays();
            focusCanvasEditor();
          }}
        />

        {!sceneState.hasElements && (
          <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-[40%] flex-col items-center gap-[7px] text-center text-muted">
            <span className="grid size-8 place-items-center rounded-[9px] border border-dashed border-accent text-xl text-accent">+</span>
            <strong className="text-sm font-medium text-ink">Start mapping</strong>
            <span className="whitespace-nowrap text-[11px] max-[700px]:w-[180px] max-[700px]:whitespace-normal">Add a shape, code block, image, connection, or structured diagram.</span>
          </div>
        )}
        <Excalidraw
          initialData={initialData}
          onInitialize={onInitialize}
          onChange={changed}
          onLibraryChange={persistLibraryItems}
          theme={dark ? "dark" : "light"}
          autoFocus={false}
          handleKeyboardGlobally={false}
          validateEmbeddable={true}
          UIOptions={canvasUIOptions}
        />
        <CanvasObjectContextMenu
          point={objectContextMenu}
          api={canvasApi}
          activeTool={sceneState.activeTool}
          selectedElementCount={selectionState.selectedElementCount}
          fullMode={fullMode}
          gridModeEnabled={sceneState.gridModeEnabled}
          objectsSnapModeEnabled={sceneState.objectsSnapModeEnabled}
          viewModeEnabled={sceneState.viewModeEnabled}
          renderCustomBody={
            selectedCodeMenuProps
              ? ({ openSub, setOpenSub, onClose }) => (
                  <CodeBlockContextMenu code={selectedCodeMenuProps} openSub={openSub} setOpenSub={setOpenSub} onClose={onClose} />
                )
              : selectedNoteMenuProps
                ? ({ onClose }) => (
                    <NoteCardContextMenu note={selectedNoteMenuProps} onClose={onClose} />
                  )
                : undefined
          }
          onToggleFullMode={toggleFullMode}
          onAction={runCanvasAction}
          onClose={closeCanvasPopovers}
        />
        <NotePickerPopover
          open={notePickerOpen}
          onOpenChange={setNotePickerOpen}
          currentCanvasNoteIds={currentCanvasNoteIds}
          onSelectNote={(noteId) => placeLinkedNote(noteId)}
        />
      </div>
    </CanvasControllerProvider>
  );
}
