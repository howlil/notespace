import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements, getCommonBounds, newElementWith, reconcileElements, sceneCoordsToViewportCoords, serializeAsJSON, useHandleLibrary } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { readStoredLibraryItems, writeStoredLibraryItems } from "./assets/canvas-library";
import type { Snapshot } from "../../../domain/workspace/workspace";
import { duplicatedNoteInstanceIds, readCanvasNoteReference, withCanvasNoteReference } from "../../../domain/note/note";
import type { CreateNoteInstanceRequest, CreateNoteInstanceResult, Note } from "../../../adapters/http/note-api";
import { DiagramPalette } from "./diagram/palette/DiagramPalette";
import {
  DIAGRAM_DATA_KEY,
  emptyDiagramSelection,
  readStructuredDiagrams,
  selectionForElements,
  syncDiagramsFromElements,
  type DiagramSelection,
  type StructuredDiagram,
} from "../../../domain/diagram/diagram";
import { useToast } from "../../../shared/ui/feedback/toast-provider";
import { mergeDiagramHistory, mergeDiagramSets, sameDiagramSelection, sameStructuredDiagrams } from "./state/canvas-state";
import { directionFromKey } from "./flowchart/CanvasDirectionalSpawn";
import { CanvasCodeBlockActions } from "./code/CanvasCodeBlockActions";
import { CanvasCodeBlockLayer, defaultCodeBlockView, type CodeBlockViewOptions } from "./code/CanvasCodeBlockLayer";
import { copyCanvasImage, downloadCanvasImage } from "./code/canvas-code-block-export-actions";
import { defaultCanvasCodeBlock, effectiveCanvasCodeLanguage, readCanvasCodeBlock, withCanvasCodeBlock, type CanvasCodeBlockData } from "./code/canvas-code-block";
import { canPreviewHtml } from "./code/preview/can-preview-html";
import { CODE_BLOCK_DEFAULT_WIDTH, codeBlockHeightChanged, codeBlockMinimumHeight, codeElementContainsClientPoint } from "./code/canvas-code-block-layout";
import { CanvasBottomChrome, type CanvasContextualAnchor } from "./chrome/CanvasBottomChrome";
import { CanvasToolRail } from "./chrome/CanvasToolRail";
import { CanvasNoteActions, CanvasNoteCardLayer } from "./note/CanvasNoteCardLayer";
import type { NoteSaveStatus } from "./note/canvas-note-store";
import { useCanvasNotes } from "./note/use-canvas-notes";
import { registerCanvasNotePlacer } from "../../../adapters/browser/canvas-note-placement-events";
import { CanvasViewControls } from "./chrome/CanvasViewControls";
import { CanvasFlowchartHandles } from "./flowchart/CanvasFlowchartHandles";
import { CanvasSelectionActions, type CanvasRuntimeActionName } from "./selection/CanvasSelectionActions";
import {
  executeNativeAction,
  interceptNativeImageExportActions,
  interceptNativeImageExportCallback,
  type NativeImageExportAction,
} from "./native/CanvasNativeActions";
import { useCanvasPeerChannel } from "./sync/use-canvas-peer-channel";
import { useCanvasAssets } from "./assets/use-canvas-assets";
import { useCanvasFlowchart } from "./flowchart/use-canvas-flowchart";
import { useCanvasDiagramCommands } from "./diagram/use-canvas-diagram-commands";
import { useCodeRunner } from "./code/execution/use-code-runner";
import { useCanvasPinch } from "./viewport/use-canvas-pinch";
import {
  canvasBackgroundColor,
  codeGeometryMap,
  codeOverlayElements,
  deriveCanvasElementState,
  persistedAppState,
  sameElementVersions,
  sceneSignature,
} from "./state/canvas-scene-state";

type FocusRequest = { id: string; request: number } | null;
type CanvasOverlayScope = "tools" | "view" | "selection" | null;
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

function selectionContextualAnchor(elements: readonly OrderedExcalidrawElement[], state: AppState, selectedIds: readonly string[]): CanvasContextualAnchor | null {
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

function sameContextualAnchor(previous: CanvasContextualAnchor | null, next: CanvasContextualAnchor | null) {
  return previous?.left === next?.left
    && previous?.top === next?.top
    && previous?.right === next?.right
    && previous?.bottom === next?.bottom;
}

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
  onElementSelect?: (elementId: string | null) => void;
  focusRequest?: FocusRequest;
  focusNoteId?: string;
  dark: boolean;
  workspaceId: string;
  canvasVersion: number;
  onCreateNote?: (request: CreateNoteInstanceRequest) => Promise<CreateNoteInstanceResult>;
  onUpdateNote?: (noteId: string, document: Note["document"], expectedRevision: number) => Promise<Note>;
  onNoteSaveState?: (status: NoteSaveStatus) => void;
  onDeleteNoteInstance?: (workspaceId: string, instanceId: string, canvas: Snapshot, expectedCanvasVersion: number) => Promise<{ canvas: Snapshot; version: number; updatedAt: string }>;
  onRegisterAuthoringFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onRegisterCanvasExport?: (read: () => string) => (() => void) | void;
};

export default function CanvasEditor({
  initial, onChange, onElementSelect, focusRequest, focusNoteId, dark, workspaceId,
  canvasVersion, onCreateNote, onUpdateNote, onDeleteNoteInstance, onRegisterAuthoringFlush, onRegisterCanvasExport, onNoteSaveState,
}: CanvasEditorProps) {
  const { showToast } = useToast();
  useEffect(() => {
    if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
  }, []);
  const [initialData] = useState(() => {
    const data = { ...initial.data };
    delete data.files;
    delete data[DIAGRAM_DATA_KEY];
    return {
      ...data,
      appState: { viewBackgroundColor: dark ? "#1d1e24" : "#f8f9fc", ...(initial.data.appState as object) },
      files: {},
    } as ExcalidrawInitialDataState;
  });
  const initialElements = Array.isArray(initial.data.elements) ? initial.data.elements as OrderedExcalidrawElement[] : [];
  const initialCodeElements = codeOverlayElements(initialElements);
  const [hasElements, setHasElements] = useState(() => initialElements.some((element) => !element.isDeleted));
  const [overlayElements, setOverlayElements] = useState<readonly OrderedExcalidrawElement[]>(initialCodeElements);
  const [sceneElements, setSceneElements] = useState<readonly OrderedExcalidrawElement[]>(initialElements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingCodeBlockId, setEditingCodeBlockId] = useState<string | null>(null);
  const [editingNoteElementId, setEditingNoteElementId] = useState<string | null>(null);
  const [codeBlockViews, setCodeBlockViews] = useState<Record<string, CodeBlockViewOptions>>({});
  const updateCodeView = useCallback((id: string, patch: Partial<CodeBlockViewOptions>) => {
    setCodeBlockViews((current) => ({ ...current, [id]: { ...(current[id] ?? defaultCodeBlockView), ...patch } }));
  }, []);
  const [canvasViewport, setCanvasViewport] = useState({ zoom: 1, scrollX: 0, scrollY: 0 });
  const viewportRef = useRef(canvasViewport);
  const codeGeometryRef = useRef(codeGeometryMap(initialElements));
  const expectedAutoFitHeightRef = useRef(new Map<string, number>());
  const [backgroundColor, setBackgroundColor] = useState(() => canvasBackgroundColor(initial.data, dark ? "#1d1e24" : "#f8f9fc"));
  const [toolOverlay, setToolOverlay] = useState<"diagram" | "more" | null>(null);
  const [activeCanvasOverlay, setActiveCanvasOverlay] = useState<CanvasOverlayScope>(null);
  const diagramOpen = toolOverlay === "diagram";
  const moreOpen = toolOverlay === "more";
  const [diagrams, setDiagrams] = useState(() => readStructuredDiagrams(initial.data));
  const diagramsRef = useRef(diagrams);
  const diagramHistoryRef = useRef(diagrams);
  const [diagramSelection, setDiagramSelection] = useState<DiagramSelection>(() => emptyDiagramSelection());
  const diagramSelectionRef = useRef(diagramSelection);
  const [lastDiagramId, setLastDiagramId] = useState<string | null>(() => diagrams.at(-1)?.id ?? null);
  const [activeTool, setActiveTool] = useState<AppState["activeTool"]["type"]>("selection");
  const [selectedElementCount, setSelectedElementCount] = useState(0);
  const [, setSelectionStyleKey] = useState("");
  const [isObjectManipulating, setIsObjectManipulating] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [viewModeEnabled, setViewModeEnabled] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<CanvasContextualAnchor | null>(null);
  const [gridModeEnabled, setGridModeEnabled] = useState(false);
  const [objectsSnapModeEnabled, setObjectsSnapModeEnabled] = useState(false);
  const [canvasApi, setCanvasApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const nativeNoteCopiesRef = useRef<((elements: readonly OrderedExcalidrawElement[], state: AppState, copyIds: string[]) => void) | null>(null);
  const [contextualInteractionActive, setContextualInteractionActive] = useState(false);
  useHandleLibrary({ excalidrawAPI: canvasApi, getInitialLibraryItems: readStoredLibraryItems });
  const diagramAnchorRef = useRef<HTMLDivElement>(null);
  const moreToolsAnchorRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);
  const selectionAnchorRef = useRef<CanvasContextualAnchor | null>(null);
  const lastExternalScene = useRef(sceneSignature(initial.data));
  const nativeImageExportRef = useRef<(name: NativeImageExportAction) => boolean>(() => false);
  nativeImageExportRef.current = (name) => {
    const currentApi = api.current;
    if (!currentApi || !currentApi.getSceneElements().some((element) => readCanvasCodeBlock(element))) return false;
    if (name === "imageExport") {
      currentApi.app.setOpenDialog({ name: "imageExport" });
      return true;
    }
    const format = name === "copyAsPng" ? "png" : "svg";
    const appState = currentApi.getAppState();
    const scene = currentApi.getSceneElements();
    const selected = scene.filter((element) => appState.selectedElementIds[element.id]);
    const source = { elements: selected.length ? selected : scene, appState, codeBlockViews };
    void copyCanvasImage(currentApi, dark, format, source).then(() => {
      showToast({ kind: "success", message: `${format.toUpperCase()} copied.` });
    }).catch((error: unknown) => {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not copy the Canvas image." });
    });
    return true;
  };
  const liveCodeBlocks = useMemo(
    () => overlayElements.flatMap((element) => {
      const block = readCanvasCodeBlock(element);
      return block ? [{ id: element.id, code: block.code, language: effectiveCanvasCodeLanguage(block) }] : [];
    }),
    [overlayElements],
  );
  const liveCodeElementIds = useMemo(() => liveCodeBlocks.map(({ id }) => id), [liveCodeBlocks]);
  const { runs: codeRuns, runBlock: executeCodeBlock, stopRun: stopCodeRun, clearRun: clearCodeRun } = useCodeRunner(liveCodeBlocks);
  const runCodeBlock = useCallback((id: string, block: CanvasCodeBlockData) => {
    const language = effectiveCanvasCodeLanguage(block);
    if (canPreviewHtml(language)) {
      updateCodeView(id, { showOutput: true, previewHtml: true });
      return;
    }
    updateCodeView(id, { showOutput: true, previewHtml: false });
    executeCodeBlock(id, { ...block, language });
  }, [executeCodeBlock, updateCodeView]);
  const toggleHtmlPreview = useCallback((id: string) => {
    setCodeBlockViews((current) => {
      const existing = current[id] ?? defaultCodeBlockView;
      const nextPreview = !(existing.showOutput && existing.previewHtml);
      return { ...current, [id]: { ...existing, showOutput: nextPreview, previewHtml: nextPreview } };
    });
  }, []);

  useEffect(() => {
    if (!canvasApi) return;
    return interceptNativeImageExportActions(canvasApi, (name) => nativeImageExportRef.current(name));
  }, [canvasApi]);

  useEffect(() => {
    if (!canvasApi) return;
    return interceptNativeImageExportCallback(canvasApi, async (type, elements, options) => {
      if (!elements.some((element) => readCanvasCodeBlock(element))) return false;
      const appState = canvasApi.getAppState();
      const source = { elements, appState, exportingFrame: options.exportingFrame, codeBlockViews };
      const exportDark = appState.exportWithDarkMode || appState.theme === "dark";
      const name = canvasApi.app.getName() || "notespace-canvas";
      try {
        if (type === "svg") await downloadCanvasImage(canvasApi, exportDark, "svg", source, name);
        else if (type === "png") await downloadCanvasImage(canvasApi, exportDark, "png", source, name);
        else await copyCanvasImage(canvasApi, exportDark, "png", source);
        showToast({ kind: "success", message: type === "clipboard" ? "PNG copied." : `${String(type).toUpperCase()} exported.` });
      } catch (error) {
        showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not export the Canvas image." });
      }
      return true;
    });
  }, [canvasApi, codeBlockViews, showToast]);

  const closeCanvasPopovers = useCallback(() => {
    setToolOverlay(null);
    setActiveCanvasOverlay(null);
  }, []);
  const closeSelectionOverlay = useCallback(() => {
    setActiveCanvasOverlay((scope) => scope === "selection" ? null : scope);
  }, []);
  const toggleToolOverlay = useCallback((next: "diagram" | "more") => {
    setToolOverlay((current) => {
      const nextOverlay = current === next ? null : next;
      setActiveCanvasOverlay(nextOverlay ? "tools" : null);
      return nextOverlay;
    });
  }, []);

  useEffect(() => {
    if (activeCanvasOverlay === "tools") return;
    setToolOverlay(null);
  }, [activeCanvasOverlay]);

  useEffect(() => {
    if (!canvasApi) return;
    setContextMenuOpen(Boolean(canvasApi.getAppState().contextMenu));
    setViewModeEnabled(canvasApi.getAppState().viewModeEnabled);
    const unsubscribeMenu = canvasApi.onStateChange("contextMenu", (menu) => setContextMenuOpen(Boolean(menu)));
    const unsubscribeView = canvasApi.onStateChange("viewModeEnabled", setViewModeEnabled);
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
  }, [canvasApi]);

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
  } = useCanvasAssets({
    initial,
    workspaceId,
    onError: reportCanvasAssetError,
  });

  useEffect(() => {
    if (!canvasApi) return;
    return onRegisterCanvasExport?.(() => serializeAsJSON(
      canvasApi.getSceneElementsIncludingDeleted(), canvasApi.getAppState(), canvasApi.getFiles(), "local",
    ));
  }, [canvasApi, onRegisterCanvasExport]);

  const decorateDirectionalSpawnTarget = useCallback((
    source: OrderedExcalidrawElement,
    target: OrderedExcalidrawElement,
  ) => {
    const sourceBlock = readCanvasCodeBlock(source);
    if (!sourceBlock) return target;
    const nextBlock = {
      ...defaultCanvasCodeBlock(),
      theme: sourceBlock.theme,
      lineNumbers: sourceBlock.lineNumbers,
    };
    return newElementWith(target, {
      customData: withCanvasCodeBlock(target.customData, nextBlock),
    });
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
  } = useCanvasFlowchart({ apiRef: api, surfaceRef, decorateTarget: decorateDirectionalSpawnTarget });

  const canvasOverlayInteractionActive = contextualInteractionActive || contextMenuOpen || viewModeEnabled || diagramOpen || moreOpen || editingCodeBlockId !== null || editingNoteElementId !== null;

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

  const handlePeerSnapshot = useCallback((snapshot: Snapshot) => {
    const value = api.current;
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

    // Peer tabs share authored elements, not each other's viewport/UI state.
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
    if (serialized === last.current) return;

    last.current = serialized;
    lastExternalScene.current = serialized;
    updateDiagramState(nextDiagrams);
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    setHasElements(mergedElements.some((element) => !element.isDeleted));
    const nextCodeElements = codeOverlayElements(mergedElements);
    codeGeometryRef.current = codeGeometryMap(mergedElements);
    expectedAutoFitHeightRef.current.clear();
    setOverlayElements(nextCodeElements);

    value.updateScene({
      elements: mergedElements,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    onChange({ format: "excalidraw", version: 1, data });
  }, [onChange, updateDiagramState]);

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
    last.current = serialized;
    lastExternalScene.current = serialized;
    onChange(snapshot);
    publishPeerSnapshot(snapshot);
  }, [onChange, publishPeerSnapshot]);


  useEffect(() => {
    if (!api.current) return;
    const signature = sceneSignature(initial.data);
    if (signature === lastExternalScene.current) return;
    const elements = Array.isArray(initial.data.elements) ? initial.data.elements as OrderedExcalidrawElement[] : [];
    const nextDiagrams = readStructuredDiagrams(initial.data);
    diagramHistoryRef.current = nextDiagrams;
    updateDiagramState(nextDiagrams);
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    setHasElements(elements.length > 0);
    setSceneElements(elements);
    const nextCodeElements = codeOverlayElements(elements);
    codeGeometryRef.current = codeGeometryMap(elements);
    expectedAutoFitHeightRef.current.clear();
    setOverlayElements(nextCodeElements);
    api.current.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    lastExternalScene.current = signature;
    void restoreLocalFiles(api.current).catch((error: unknown) => {
      reportCanvasAssetError(error instanceof Error ? error.message : "Could not load Canvas images.");
    });
  }, [initial, reportCanvasAssetError, restoreLocalFiles, updateDiagramState]);

  useEffect(() => {
    if (!focusRequest || !canvasApi) return;
    const element = canvasApi.getSceneElements().find((candidate) => candidate.id === focusRequest.id && !candidate.isDeleted);
    if (!element) return;
    canvasApi.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    canvasApi.setViewport({ target: element, fit: "scale-down", animation: { duration: 250 } });
  }, [canvasApi, focusRequest]);

  useEffect(() => {
    if (!focusNoteId || !canvasApi) return;
    const element = canvasApi.getSceneElements().find((candidate) => readCanvasNoteReference(candidate)?.noteId === focusNoteId && !candidate.isDeleted);
    if (!element) return;
    setEditingNoteElementId(null);
    setSelectedElementCount(1);
    setSelectedElementId(element.id);
    canvasApi.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    canvasApi.setViewport({ target: element, fit: "scale-down", animation: { duration: 250 } });
  }, [canvasApi, focusNoteId]);

  const changed = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, files: BinaryFiles) => {
    setActiveTool(state.activeTool.type);
    setIsObjectManipulating(isCanvasObjectManipulating(state));
    const selectedIds = Object.entries(state.selectedElementIds).filter(([, value]) => value).map(([id]) => id);
    setSelectedElementCount(selectedIds.length);
    setSelectionStyleKey(elements.filter((element) => state.selectedElementIds[element.id]).map((element) => `${element.id}:${element.version}`).join("|") + JSON.stringify([
      state.currentItemStrokeColor, state.currentItemBackgroundColor, state.currentItemStrokeWidthKey,
      state.currentItemFillStyle, state.currentItemOpacity, state.currentItemStrokeVariability,
      state.currentItemStrokeStyle, state.currentItemRoughness, state.currentItemRoundness,
      state.currentItemStartArrowhead, state.currentItemEndArrowhead,
      state.currentItemFontFamily, state.currentItemFontSize, state.currentItemTextAlign,
    ]));
    const nextSelectionAnchor = selectionContextualAnchor(elements, state, selectedIds);
    if (!sameContextualAnchor(selectionAnchorRef.current, nextSelectionAnchor)) {
      selectionAnchorRef.current = nextSelectionAnchor;
      setSelectionAnchor(nextSelectionAnchor);
    }

    const nextViewport = { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
    const previousViewport = viewportRef.current;
    if (
      nextViewport.zoom !== previousViewport.zoom
      || nextViewport.scrollX !== previousViewport.scrollX
      || nextViewport.scrollY !== previousViewport.scrollY
    ) {
      viewportRef.current = nextViewport;
      setCanvasViewport(nextViewport);
    }

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
      (element, block) => newElementWith(element, {
        customData: withCanvasCodeBlock(element.customData, block),
      }),
      (element, reference) => newElementWith(element, {
        customData: withCanvasNoteReference(element.customData, reference),
      }),
      isCanvasObjectManipulating(state),
    );
    setSceneElements((current) => sameElementVersions(current, authoredElements) ? current : authoredElements);
    for (const elementId of acknowledgedAutoFitIds) expectedAutoFitHeightRef.current.delete(elementId);
    codeGeometryRef.current = codeGeometry;
    setOverlayElements((current) => sameElementVersions(current, nextCodeElements) ? current : nextCodeElements);
    if (normalizedManualResize) {
      api.current?.updateScene({ elements: authoredElements, captureUpdate: CaptureUpdateAction.NEVER });
    }
    setGridModeEnabled(state.gridModeEnabled);
    setObjectsSnapModeEnabled(state.objectsSnapModeEnabled);
    setBackgroundColor(state.viewBackgroundColor);
    const selected = selectedIds[0] ?? null;
    setSelectedElementId(selected);
    if (selected !== lastSelected.current) {
      lastSelected.current = selected;
      onElementSelect?.(selected);
    }
    setHasElements(hasLiveElements);

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
      nextDiagramSelection.nodeIds.length > 0,
    );

    const copiedNoteElementIds = duplicatedNoteInstanceIds(authoredElements);
    if (copiedNoteElementIds.length) {
      // Nothing with a shared instance may be persisted: each copy gets its own Note first.
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
    if (serialized === last.current) return;
    const first = last.current === "";
    last.current = serialized;
    lastExternalScene.current = serialized;
    if (!first) {
      const snapshot: Snapshot = { format: "excalidraw", version: 1, data };
      onChange(snapshot);
      publishPeerSnapshot(snapshot);
    }
  }, [onChange, onElementSelect, persistCanvasFiles, publishPeerSnapshot, syncFlowchartSelection, updateDiagramSelection, updateDiagramState]);

  const onInitialize = useCallback((value: ExcalidrawImperativeAPI) => {
    api.current = value;
    setCanvasApi(value);
    const state = value.getAppState();
    const initialViewport = { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
    viewportRef.current = initialViewport;
    setCanvasViewport(initialViewport);
    const initializedElements = value.getSceneElementsIncludingDeleted();
    setSceneElements(initializedElements);
    const nextCodeElements = codeOverlayElements(initializedElements);
    codeGeometryRef.current = codeGeometryMap(initializedElements);
    setOverlayElements(nextCodeElements);
    setGridModeEnabled(state.gridModeEnabled);
    setObjectsSnapModeEnabled(state.objectsSnapModeEnabled);
    void restoreLocalFiles(value);
  }, [restoreLocalFiles]);

  const setCanvasBackground = useCallback((color: string) => {
    const value = api.current;
    if (!value) return;
    setBackgroundColor(color);
    value.updateScene({ appState: { viewBackgroundColor: color }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, []);

  const {
    noteActivationPoint,
    startNoteEditing,
    finishNoteEditing,
    insertNote,
    placeLinkedNote,
    deleteSelectedNote,
    removeMissingNote,
    duplicateSelectedNote,
    toggleFoldNote,
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
    sceneElements,
    selectedElementId,
    selectedElementCount,
    editingNoteElementId,
    canvasOverlayInteractionActive,
    viewModeEnabled,
    onCreateNote,
    onDeleteNoteInstance,
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

  const updateCodeBlock = useCallback((elementId: string, block: CanvasCodeBlockData) => {
    const value = api.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId) return element;
      const previous = readCanvasCodeBlock(element);
      if (!previous) return element;
      if (previous.code !== block.code || previous.language !== block.language) clearCodeRun(elementId);
      if (!canPreviewHtml(effectiveCanvasCodeLanguage(block))) {
        updateCodeView(elementId, { previewHtml: false });
      }
      return newElementWith(element, {
        customData: withCanvasCodeBlock(element.customData, block),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [clearCodeRun, updateCodeView]);

  const autoFitCodeBlock = useCallback((elementId: string, targetHeight: number) => {
    const value = api.current;
    if (!value) return;
    const current = value.getSceneElementsIncludingDeleted().find((element) => element.id === elementId);
    const block = current ? readCanvasCodeBlock(current) : null;
    if (!current || !block || block.heightMode !== "auto" || !codeBlockHeightChanged(current.height, targetHeight)) return;
    expectedAutoFitHeightRef.current.set(elementId, targetHeight);
    const elements = value.getSceneElementsIncludingDeleted().map((element) => (
      element.id === elementId ? newElementWith(element, { height: targetHeight }) : element
    )) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, []);

  const insertCodeBlock = useCallback(() => {
    const value = api.current;
    if (!value) return;
    const state = value.getAppState();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const viewportWidth = bounds?.width ?? 900;
    const viewportHeight = bounds?.height ?? 600;
    const width = CODE_BLOCK_DEFAULT_WIDTH;
    const height = codeBlockMinimumHeight();
    const x = viewportWidth / (2 * state.zoom.value) - state.scrollX - width / 2;
    const y = viewportHeight / (2 * state.zoom.value) - state.scrollY - height / 2;
    const block = defaultCanvasCodeBlock();
    const skeleton: ExcalidrawElementSkeleton = {
      type: "rectangle",
      x,
      y,
      width,
      height,
      strokeColor: dark ? "#4e5257" : "#c9ccd1",
      backgroundColor: dark ? "#2b2b2b" : "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      customData: withCanvasCodeBlock(undefined, block),
    };
    const created = convertToExcalidrawElements([skeleton]) as OrderedExcalidrawElement[];
    const codeElement = created[0];
    if (!codeElement) return;
    const elements = [...value.getSceneElementsIncludingDeleted(), ...created] as OrderedExcalidrawElement[];
    value.updateScene({
      elements,
      appState: { selectedElementIds: { [codeElement.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    value.setActiveTool({ type: "selection" }, { keepSelection: true });
    setSelectedElementId(codeElement.id);
    setOverlayElements(elements);
    setHasElements(true);
  }, [dark]);

  const {
    activeDiagram,
    selectedNodeLabel,
    selectedEdgeLabel,
    selectedGroupLabel,
    insertNode,
    connectSelected,
    groupSelected,
    renameSelectedNode,
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
      ? Boolean(target.closest(".notespace-selection-actions, [role=\"dialog\"]"))
      : Boolean(document.querySelector(".notespace-selection-actions [role=\"dialog\"]"));
    if (canvasPanelOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.isComposing) return;
    const value = api.current;
    if (!value) return;
    const state = value.getAppState() as AppState & { editingLinearElement?: unknown };
    if (state.editingTextElement || state.editingLinearElement || state.openDialog) return;
    const selectedIds = Object.entries(state.selectedElementIds).filter(([, selected]) => selected).map(([id]) => id);
    if (selectedIds.length !== 1) return;

    if (spawnSelectedDiagramNode(direction)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (!beginNativeFlowchartPreview(direction)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, [beginNativeFlowchartPreview, canvasOverlayInteractionActive, spawnSelectedDiagramNode]);

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
    if (editingCodeBlockId && (!liveCodeElementIds.includes(editingCodeBlockId) || selectedElementCount !== 1 || selectedElementId !== editingCodeBlockId)) setEditingCodeBlockId(null);
    setCodeBlockViews((current) => {
      const entries = Object.entries(current).filter(([id]) => liveCodeElementIds.includes(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [editingCodeBlockId, liveCodeElementIds, selectedElementCount, selectedElementId]);

  useCanvasPinch(surfaceRef, api);

  useEffect(() => {
    if (viewModeEnabled || !onCreateNote) return;
    return registerCanvasNotePlacer((noteId) => placeLinkedNote(noteId));
  }, [onCreateNote, placeLinkedNote, viewModeEnabled]);

  useEffect(() => {
    window.addEventListener("keydown", handleDirectionalSpawnKeyDown, true);
    window.addEventListener("keyup", handleDirectionalSpawnKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleDirectionalSpawnKeyDown, true);
      window.removeEventListener("keyup", handleDirectionalSpawnKeyUp, true);
    };
  }, [handleDirectionalSpawnKeyDown, handleDirectionalSpawnKeyUp]);

  return (
    <div
      ref={surfaceRef}
      className="notespace-canvas-surface relative h-full min-h-0 w-full"
      aria-label="Workspace canvas"
      onPointerMoveCapture={(event) => {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
        const target = event.target;
        if (target instanceof Element && target.closest(".excalidraw__canvas, [data-flowchart-handle]")) {
          trackFlowchartPointer(event.clientX, event.clientY, event.pointerType);
        } else {
          clearFlowchartHover();
        }
      }}
      onPointerLeave={clearFlowchartHover}
      onPointerDownCapture={(event) => {
        if (event.pointerType === "touch") trackFlowchartPointer(event.clientX, event.clientY, "touch");
        const target = event.target;
        if (!(target instanceof Element) || !target.closest(".excalidraw__canvas")) return;
        focusCanvasEditor();
      }}
      onDoubleClickCapture={(event) => {
        if (editingCodeBlockId || editingNoteElementId) return;
        const target = event.target;
        if (target instanceof Element && target.closest(".notespace-selection-actions")) return;
        const value = api.current;
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (!value || !rect) return;
        const selectedIds = Object.entries(value.getAppState().selectedElementIds)
          .filter(([, selected]) => selected)
          .map(([id]) => id);
        if (selectedIds.length !== 1) return;
        const element = value.getSceneElementsIncludingDeleted().find((candidate) => candidate.id === selectedIds[0] && !candidate.isDeleted);
        if (!element) return;
        if (readCanvasNoteReference(element)) {
          if (!codeElementContainsClientPoint(element, canvasViewport, rect, event.clientX, event.clientY)) return;
          event.preventDefault();
          event.stopPropagation();
          setSelectedElementId(element.id);
          startNoteEditing(element.id, { clientX: event.clientX, clientY: event.clientY });
          return;
        }
        if (!readCanvasCodeBlock(element)) return;
        if (!codeElementContainsClientPoint(element, canvasViewport, rect, event.clientX, event.clientY)) return;
        event.preventDefault();
        event.stopPropagation();
        setSelectedElementId(element.id);
        setEditingCodeBlockId(element.id);
      }}
    >
      <CanvasCodeBlockLayer
        elements={overlayElements}
        viewport={canvasViewport}
        appDark={dark}
        selectedElementId={selectedElementId}
        editingElementId={editingCodeBlockId}
        runs={codeRuns}
        views={codeBlockViews}
        onUpdate={updateCodeBlock}
        onEditingChange={setEditingCodeBlockId}
        onRun={runCodeBlock}
        onAutoFit={autoFitCodeBlock}
      />
      <CanvasNoteCardLayer
        workspaceId={workspaceId}
        elements={sceneElements}
        viewport={canvasViewport}
        selectedElementId={selectedElementId}
        editingElementId={editingNoteElementId}
        activationPoint={noteActivationPoint}
        onEditingChange={finishNoteEditing}
        onRegisterFlush={registerNoteFlush}
        onUpdateNote={onUpdateNote ?? (async () => { throw new Error("Note editing is unavailable."); })}
        onSaveState={onNoteSaveState}
        onAutoResize={resizeNote}
        onRemoveMissing={removeMissingNote}
        onPlaceLinkedNote={placeLinkedNote}
        onError={reportCanvasAssetError}
      />
      <CanvasViewControls api={canvasApi} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} onAction={runCanvasAction} onToolOverlayOpen={closeCanvasPopovers} onOverlayOpen={() => setActiveCanvasOverlay("view")} overlayActive={activeCanvasOverlay === null || activeCanvasOverlay === "view"} toolOverlayOpen={toolOverlay !== null} />
      <CanvasBottomChrome
        contextualAnchor={selectionAnchor}
        activeTool={activeTool}
        contextualVisible={!isObjectManipulating && !contextMenuOpen && !viewModeEnabled}
        contextual={(() => {
          const selectedCodeElement = overlayElements.find((element) => element.id === selectedElementId && !element.isDeleted);
          const selectedCodeBlock = readCanvasCodeBlock(selectedCodeElement);
          if (selectedElementCount === 1 && selectedCodeElement && selectedCodeBlock) {
            const view = codeBlockViews[selectedCodeElement.id] ?? defaultCodeBlockView;
            const previewing = Boolean(view.showOutput && view.previewHtml && canPreviewHtml(selectedCodeBlock));
            return (
              <CanvasCodeBlockActions
                appDark={dark}
                key={selectedCodeElement.id}
                suppressed={isObjectManipulating || contextMenuOpen || viewModeEnabled}
                onExitEditing={() => setEditingCodeBlockId(null)}
                block={selectedCodeBlock}
                outputVisible={Boolean(view.showOutput)}
                wordWrap={view.wordWrap}
                running={codeRuns[selectedCodeElement.id]?.status === "running"}
                previewing={previewing}
                onToggleOutput={() => {
                  const nextOutput = !view.showOutput;
                  updateCodeView(selectedCodeElement.id, { showOutput: nextOutput, previewHtml: nextOutput ? view.previewHtml : false });
                }}
                onTogglePreview={() => toggleHtmlPreview(selectedCodeElement.id)}
                onToggleWrap={() => updateCodeView(selectedCodeElement.id, { wordWrap: !view.wordWrap })}
                onRun={() => runCodeBlock(selectedCodeElement.id, selectedCodeBlock)}
                onStop={() => stopCodeRun(selectedCodeElement.id)}
                onDuplicate={() => runCanvasAction("duplicateSelection")}
                onUpdate={(block) => updateCodeBlock(selectedCodeElement.id, block)}
                onFitContent={() => {
                  updateCodeView(selectedCodeElement.id, { fitRevision: (codeBlockViews[selectedCodeElement.id]?.fitRevision ?? 0) + 1 });
                  updateCodeBlock(selectedCodeElement.id, { ...selectedCodeBlock, heightMode: "auto" });
                }}
                onDelete={() => {
                  clearCodeRun(selectedCodeElement.id);
                  updateCodeView(selectedCodeElement.id, { showOutput: false, previewHtml: false });
                  setEditingCodeBlockId(null);
                  runCanvasAction("deleteSelectedElements");
                }}
              />
            );
          }
          const selectedNoteElement = sceneElements.find((element) => element.id === selectedElementId && !element.isDeleted);
          const selectedNoteReference = readCanvasNoteReference(selectedNoteElement);
          if (selectedElementCount === 1 && selectedNoteElement && selectedNoteReference) {
            if (editingNoteElementId === selectedNoteElement.id) return null;
            return <CanvasNoteActions
              folded={selectedNoteReference.compact === true}
              fixedHeight={selectedNoteReference.heightMode === "fixed"}
              onEdit={() => startNoteEditing(selectedNoteElement.id, null)}
              onToggleFold={() => toggleFoldNote(selectedNoteElement.id, selectedNoteReference)}
              onFitContent={() => fitNoteContent(selectedNoteElement.id)}
              onPlaceLinked={() => { void placeLinkedNote(selectedNoteReference.noteId); }}
              onDuplicate={() => runCanvasAction("duplicateSelection")}
              onDelete={() => runCanvasAction("deleteSelectedElements")}
            />;
          }
          return (
            <CanvasSelectionActions
              api={canvasApi}
              activeTool={activeTool}
              selectedElementCount={selectedElementCount}
              isManipulating={isObjectManipulating}
              contextMenuOpen={contextMenuOpen}
              viewModeEnabled={viewModeEnabled}
              contextualAnchor={selectionAnchor}
              onAction={runCanvasAction}
              onInteractionStateChange={setContextualInteractionActive}
              onOverlayOpen={() => setActiveCanvasOverlay("selection")}
              onOverlayClose={closeSelectionOverlay}
              overlayActive={activeCanvasOverlay === null || activeCanvasOverlay === "selection"}
            />
          );
        })()}
        tools={(
          <CanvasToolRail
          api={canvasApi}
          diagramAnchorRef={diagramAnchorRef}
          moreToolsAnchorRef={moreToolsAnchorRef}
          activeTool={activeTool}
          backgroundColor={backgroundColor}
          diagramOpen={diagramOpen}
          moreOpen={moreOpen}
          onOverlayOpen={() => setActiveCanvasOverlay("tools")}
          onDiagramToggle={() => toggleToolOverlay("diagram")}
          onMoreToggle={() => toggleToolOverlay("more")}
          onCoreToolSelect={closeCanvasPopovers}
          onInsertCodeBlock={insertCodeBlock}
          onInsertNote={() => { void insertNote(); }}
          onBackgroundChange={setCanvasBackground}
          onAction={runCanvasAction}
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
        onPreviewStart={beginNativeFlowchartPreview}
        onPreviewCancel={cancelNativeFlowchartPreview}
        onCommit={commitNativeFlowchartPreview}
      />

      {!hasElements && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-[40%] flex-col items-center gap-[7px] text-center text-muted">
          <span className="grid size-8 place-items-center rounded-[9px] border border-dashed border-accent text-xl text-accent">+</span>
          <strong className="text-sm font-medium text-ink">Start mapping</strong>
          <span className="whitespace-nowrap text-[11px] max-[700px]:w-[180px] max-[700px]:whitespace-normal">Add a shape, code block, image, connection, or structured diagram.</span>
        </div>
      )}
      <Excalidraw initialData={initialData} onInitialize={onInitialize} onChange={changed} onLibraryChange={persistLibraryItems} theme={dark ? "dark" : "light"} autoFocus={false} handleKeyboardGlobally={false} validateEmbeddable={true} UIOptions={canvasUIOptions} />
    </div>
  );
}
