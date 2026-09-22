import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements, newElementWith, reconcileElements, useHandleLibrary } from "@excalidraw/excalidraw";
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
import { readLocalStorage, writeLocalStorage } from "../../browser/local-storage";
import type { Note, Snapshot } from "../../domain/project/project";
import { DiagramPalette } from "../../features/diagram/DiagramPalette";
import {
  DIAGRAM_DATA_KEY,
  emptyDiagramSelection,
  readStructuredDiagrams,
  selectionForElements,
  syncDiagramsFromElements,
  type DiagramSelection,
  type StructuredDiagram,
} from "../../features/diagram/diagram-model";
import { useToast } from "../../providers/toast-provider";
import { mergeDiagramHistory, sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state";
import { directionFromKey } from "./CanvasDirectionalSpawn";
import { CanvasCodeBlockActions } from "./CanvasCodeBlockActions";
import { CanvasCodeBlockLayer } from "./CanvasCodeBlockLayer";
import { CanvasNoteArtifactActions } from "./CanvasNoteArtifactActions";
import { CanvasNoteArtifactLayer } from "./CanvasNoteArtifactLayer";
import { CanvasNotePicker } from "./CanvasNotePicker";
import { canvasNoteArtifactElements, readCanvasNoteArtifact, withCanvasNoteArtifact, type CanvasNoteArtifactData } from "./canvas-note-artifact";
import { defaultCanvasCodeBlock, readCanvasCodeBlock, withCanvasCodeBlock, type CanvasCodeBlockData } from "./canvas-code-block";
import { CODE_BLOCK_DEFAULT_WIDTH, codeBlockHeightChanged, codeBlockMinimumHeight } from "./canvas-code-block-layout";
import { CanvasBottomChrome, CanvasToolRail, CanvasViewControls } from "./CanvasChrome";
import { CanvasFlowchartHandles } from "./CanvasFlowchartHandles";
import { CanvasSelectionActions, type CanvasRuntimeActionName } from "./CanvasSelectionActions";
import { useCanvasPeerChannel } from "./use-canvas-peer-channel";
import { useCanvasAssets } from "./use-canvas-assets";
import { useCanvasFlowchart } from "./use-canvas-flowchart";
import { useCanvasDiagramCommands } from "./use-canvas-diagram-commands";
import { useCanvasCodeRunner } from "./use-canvas-code-runner";
import {
  canvasBackgroundColor,
  codeGeometryMap,
  codeOverlayElements,
  deriveCanvasElementState,
  persistedAppState,
  sameElementVersions,
  sceneSignature,
} from "./canvas-scene-state";

type FocusRequest = { id: string; request: number } | null;

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

const EXCALIDRAW_LIBRARY_STORAGE_KEY = "notespace.excalidraw.library.v1";

declare global {
  interface Window { EXCALIDRAW_ASSET_PATH: string; }
}
function readStoredLibraryItems(): LibraryItems {
  try {
    const raw = readLocalStorage(EXCALIDRAW_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as LibraryItems : [];
  } catch {
    return [];
  }
}

function mergeDiagramSets(local: readonly StructuredDiagram[], remote: readonly StructuredDiagram[]) {
  const merged = new Map(local.map((diagram) => [diagram.id, diagram]));
  for (const diagram of remote) merged.set(diagram.id, diagram);
  return [...merged.values()];
}

function codeElementContainsClientPoint(
  element: OrderedExcalidrawElement,
  viewport: { zoom: number; scrollX: number; scrollY: number },
  surfaceRect: DOMRect,
  clientX: number,
  clientY: number,
) {
  const zoom = viewport.zoom;
  const left = (element.x + viewport.scrollX) * zoom;
  const top = (element.y + viewport.scrollY) * zoom;
  const width = element.width * zoom;
  const height = element.height * zoom;
  const pointX = clientX - surfaceRect.left;
  const pointY = clientY - surfaceRect.top;
  const centerX = left + width / 2;
  const centerY = top + height / 2;
  const dx = pointX - centerX;
  const dy = pointY - centerY;
  const cos = Math.cos(-element.angle);
  const sin = Math.sin(-element.angle);
  const localX = dx * cos - dy * sin + width / 2;
  const localY = dx * sin + dy * cos + height / 2;
  return localX >= 0 && localX <= width && localY >= 0 && localY <= height;
}

export default function CanvasEditor({ initial, onChange, onElementSelect, focusRequest, dark, workspaceId, notes, onOpenNote }: { initial: Snapshot; onChange: (snapshot: Snapshot) => void; onElementSelect?: (elementId: string | null) => void; focusRequest?: FocusRequest; dark: boolean; workspaceId: string; notes: readonly Note[]; onOpenNote: (noteId: string) => void }) {
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
  const initialNoteElements = canvasNoteArtifactElements(initialElements);
  const [hasElements, setHasElements] = useState(() => initialElements.some((element) => !element.isDeleted));
  const [overlayElements, setOverlayElements] = useState<readonly OrderedExcalidrawElement[]>(initialCodeElements);
  const [noteOverlayElements, setNoteOverlayElements] = useState<readonly OrderedExcalidrawElement[]>(initialNoteElements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingCodeBlockId, setEditingCodeBlockId] = useState<string | null>(null);
  const [canvasViewport, setCanvasViewport] = useState({ zoom: 1, scrollX: 0, scrollY: 0 });
  const viewportRef = useRef(canvasViewport);
  const codeGeometryRef = useRef(codeGeometryMap(initialCodeElements));
  const expectedAutoFitHeightRef = useRef(new Map<string, number>());
  const [backgroundColor, setBackgroundColor] = useState(() => canvasBackgroundColor(initial.data, dark ? "#1d1e24" : "#f8f9fc"));
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [diagrams, setDiagrams] = useState(() => readStructuredDiagrams(initial.data));
  const diagramsRef = useRef(diagrams);
  const diagramHistoryRef = useRef(diagrams);
  const [diagramSelection, setDiagramSelection] = useState<DiagramSelection>(() => emptyDiagramSelection());
  const diagramSelectionRef = useRef(diagramSelection);
  const [lastDiagramId, setLastDiagramId] = useState<string | null>(() => diagrams.at(-1)?.id ?? null);
  const [activeTool, setActiveTool] = useState<AppState["activeTool"]["type"]>("selection");
  const [selectedElementCount, setSelectedElementCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [gridModeEnabled, setGridModeEnabled] = useState(false);
  const [objectsSnapModeEnabled, setObjectsSnapModeEnabled] = useState(false);
  const [canvasApi, setCanvasApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [contextualInteractionActive, setContextualInteractionActive] = useState(false);
  useHandleLibrary({ excalidrawAPI: canvasApi, getInitialLibraryItems: readStoredLibraryItems });
  const panelAnchorRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);
  const lastExternalScene = useRef(sceneSignature(initial.data));
  const liveCodeElementIds = useMemo(
    () => overlayElements.map((element) => element.id),
    [overlayElements],
  );
  const { runs: codeRuns, runBlock: runCodeBlock, stopRun: stopCodeRun, clearRun: clearCodeRun } = useCanvasCodeRunner(liveCodeElementIds);

  const closeCanvasPopovers = useCallback(() => {
    setMoreOpen(false);
    setNotePickerOpen(false);
  }, []);

  const reportCanvasAssetError = useCallback((message: string) => {
    showToast({ kind: "error", message });
  }, [showToast]);
  const reportCanvasSuccess = useCallback((message: string) => {
    showToast({ kind: "success", message });
  }, [showToast]);
  const { restoreFiles: restoreLocalFiles, persistFiles: persistCanvasFiles } = useCanvasAssets({
    initial,
    workspaceId,
    onError: reportCanvasAssetError,
  });

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
    previewDirection: flowchartPreviewDirection,
    beginPreview: beginNativeFlowchartPreview,
    cancelPreview: cancelNativeFlowchartPreview,
    commitPreview: commitNativeFlowchartPreview,
    syncSelection: syncFlowchartSelection,
    focusEditor: focusCanvasEditor,
  } = useCanvasFlowchart({ apiRef: api, surfaceRef, decorateTarget: decorateDirectionalSpawnTarget });

  const canvasOverlayInteractionActive = contextualInteractionActive || diagramOpen || notePickerOpen || moreOpen || editingCodeBlockId !== null;

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
    if (!writeLocalStorage(EXCALIDRAW_LIBRARY_STORAGE_KEY, JSON.stringify(items))) {
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
    codeGeometryRef.current = codeGeometryMap(nextCodeElements);
    expectedAutoFitHeightRef.current.clear();
    setOverlayElements(nextCodeElements);
    setNoteOverlayElements(canvasNoteArtifactElements(mergedElements));

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
    const nextCodeElements = codeOverlayElements(elements);
    codeGeometryRef.current = codeGeometryMap(nextCodeElements);
    expectedAutoFitHeightRef.current.clear();
    setOverlayElements(nextCodeElements);
    setNoteOverlayElements(canvasNoteArtifactElements(elements));
    api.current.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    lastExternalScene.current = signature;
  }, [initial, updateDiagramState]);

  useEffect(() => {
    if (!focusRequest || !canvasApi) return;
    const element = canvasApi.getSceneElements().find((candidate) => candidate.id === focusRequest.id && !candidate.isDeleted);
    if (!element) return;
    canvasApi.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    canvasApi.setViewport({ target: element, fit: "scale-down", animation: { duration: 250 } });
  }, [canvasApi, focusRequest]);

  const changed = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, files: BinaryFiles) => {
    setActiveTool(state.activeTool.type);
    const selectedIds = Object.entries(state.selectedElementIds).filter(([, value]) => value).map(([id]) => id);
    setSelectedElementCount(selectedIds.length);

    const nextViewport = { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY };
    const previousViewport = viewportRef.current;
    if (
      nextViewport.zoom !== previousViewport.zoom
      || nextViewport.scrollX !== previousViewport.scrollX
      || nextViewport.scrollY !== previousViewport.scrollY
    ) {
      viewportRef.current = nextViewport;
      if (nextViewport.zoom !== previousViewport.zoom) setZoom(nextViewport.zoom);
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
    );
    for (const elementId of acknowledgedAutoFitIds) expectedAutoFitHeightRef.current.delete(elementId);
    codeGeometryRef.current = codeGeometry;
    setOverlayElements((current) => sameElementVersions(current, nextCodeElements) ? current : nextCodeElements);
    const nextNoteElements = canvasNoteArtifactElements(authoredElements);
    setNoteOverlayElements((current) => sameElementVersions(current, nextNoteElements) ? current : nextNoteElements);
    if (normalizedManualResize) {
      api.current?.updateScene({ elements: authoredElements, captureUpdate: CaptureUpdateAction.NEVER });
    }
    setGridModeEnabled(state.gridModeEnabled);
    setObjectsSnapModeEnabled(state.objectsSnapModeEnabled);
    setBackgroundColor(state.viewBackgroundColor);
    const selected = selectedIds[0] ?? null;
    setSelectedElementId(selected);
    if (selected !== lastSelected.current) { lastSelected.current = selected; onElementSelect?.(selected); }
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

    const data = {
      elements: authoredElements,
      appState: persistedAppState(state),
      files: {},
      [DIAGRAM_DATA_KEY]: nextDiagrams,
    };
    persistCanvasFiles(files);
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
    setZoom(state.zoom.value);
    setCanvasViewport(initialViewport);
    const initializedElements = value.getSceneElementsIncludingDeleted();
    const nextCodeElements = codeOverlayElements(initializedElements);
    codeGeometryRef.current = codeGeometryMap(nextCodeElements);
    setOverlayElements(nextCodeElements);
    setNoteOverlayElements(canvasNoteArtifactElements(initializedElements));
    setGridModeEnabled(state.gridModeEnabled);
    setObjectsSnapModeEnabled(state.objectsSnapModeEnabled);
    void restoreLocalFiles(value);
  }, [restoreLocalFiles]);

  const runCanvasAction = useCallback((name: CanvasRuntimeActionName) => {
    const value = api.current;
    if (!value) return;
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
    const action = value.app.actionManager.actions[name];
    if (action) {
      value.app.actionManager.executeAction(action, "ui");
      return;
    }
    showToast({ kind: "error", message: `Canvas action “${name}” is not available in this Excalidraw build.` });
  }, [showToast]);

  const setCanvasBackground = useCallback((color: string) => {
    const value = api.current;
    if (!value) return;
    setBackgroundColor(color);
    value.updateScene({ appState: { viewBackgroundColor: color }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, []);

  const updateCodeBlock = useCallback((elementId: string, block: CanvasCodeBlockData) => {
    const value = api.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId) return element;
      const previous = readCanvasCodeBlock(element);
      if (!previous) return element;
      if (previous.code !== block.code || previous.language !== block.language) clearCodeRun(elementId);
      return newElementWith(element, {
        customData: withCanvasCodeBlock(element.customData, block),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [clearCodeRun]);

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

  const insertNoteArtifact = useCallback((noteId: string) => {
    const value = api.current;
    if (!value || !notes.some((note) => note.id === noteId)) return;
    const state = value.getAppState();
    const bounds = surfaceRef.current?.getBoundingClientRect();
    const viewportWidth = bounds?.width ?? 900;
    const viewportHeight = bounds?.height ?? 600;
    const width = 260;
    const height = 136;
    const x = viewportWidth / (2 * state.zoom.value) - state.scrollX - width / 2;
    const y = viewportHeight / (2 * state.zoom.value) - state.scrollY - height / 2;
    const artifact: CanvasNoteArtifactData = { version: 1, noteId, displayMode: "preview" };
    const skeleton: ExcalidrawElementSkeleton = {
      type: "rectangle",
      x,
      y,
      width,
      height,
      strokeColor: dark ? "#34353e" : "#e4e5ec",
      backgroundColor: dark ? "#202126" : "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      customData: withCanvasNoteArtifact(undefined, artifact),
    };
    const created = convertToExcalidrawElements([skeleton]) as OrderedExcalidrawElement[];
    const noteElement = created[0];
    if (!noteElement) return;
    const elements = [...value.getSceneElementsIncludingDeleted(), ...created] as OrderedExcalidrawElement[];
    value.updateScene({
      elements,
      appState: { selectedElementIds: { [noteElement.id]: true } },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    value.setActiveTool({ type: "selection" }, { keepSelection: true });
    setSelectedElementId(noteElement.id);
    setNoteOverlayElements(canvasNoteArtifactElements(elements));
    setHasElements(true);
    setNotePickerOpen(false);
  }, [dark, notes]);

  const updateNoteArtifact = useCallback((elementId: string, artifact: CanvasNoteArtifactData) => {
    const value = api.current;
    if (!value) return;
    const elements = value.getSceneElementsIncludingDeleted().map((element) => {
      if (element.id !== elementId) return element;
      const current = readCanvasNoteArtifact(element);
      if (!current) return element;
      const nextHeight = artifact.displayMode === "compact" ? 68 : Math.max(136, element.height);
      return newElementWith(element, {
        height: nextHeight,
        customData: withCanvasNoteArtifact(element.customData, artifact),
      });
    }) as OrderedExcalidrawElement[];
    value.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setNoteOverlayElements(canvasNoteArtifactElements(elements));
  }, []);

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
    if (canvasOverlayInteractionActive) return;
    const direction = directionFromKey(event.key);
    if (!direction || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
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
    event.preventDefault();
    event.stopImmediatePropagation();
    commitNativeFlowchartPreview();
  }, [commitNativeFlowchartPreview, flowchartPreviewDirection]);

  useEffect(() => {
    if (editingCodeBlockId && !liveCodeElementIds.includes(editingCodeBlockId)) setEditingCodeBlockId(null);
  }, [editingCodeBlockId, liveCodeElementIds]);

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
      className="notespace-canvas-surface relative min-h-0 w-full flex-1"
      aria-label="Workspace canvas"
      onPointerDownCapture={(event) => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest(".excalidraw__canvas")) return;
        focusCanvasEditor();
      }}
      onDoubleClickCapture={(event) => {
        if (editingCodeBlockId) return;
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
        const noteArtifact = readCanvasNoteArtifact(element);
        if (noteArtifact) {
          if (!codeElementContainsClientPoint(element, canvasViewport, rect, event.clientX, event.clientY)) return;
          event.preventDefault();
          event.stopPropagation();
          onOpenNote(noteArtifact.noteId);
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
      <CanvasNoteArtifactLayer
        elements={noteOverlayElements}
        viewport={canvasViewport}
        notes={notes}
        selectedElementId={selectedElementId}
      />
      <CanvasCodeBlockLayer
        elements={overlayElements}
        viewport={canvasViewport}
        appDark={dark}
        selectedElementId={selectedElementId}
        editingElementId={editingCodeBlockId}
        runs={codeRuns}
        onUpdate={updateCodeBlock}
        onEditingChange={setEditingCodeBlockId}
        onRun={runCodeBlock}
        onClearRun={clearCodeRun}
        onAutoFit={autoFitCodeBlock}
      />
      <CanvasViewControls api={canvasApi} zoom={zoom} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} onAction={runCanvasAction} />
      {notePickerOpen && <CanvasNotePicker notes={notes} onSelect={insertNoteArtifact} onClose={() => setNotePickerOpen(false)} />}
      <CanvasBottomChrome
        contextual={(() => {
          const selectedNoteElement = selectedElementCount === 1
            ? noteOverlayElements.find((element) => element.id === selectedElementId && !element.isDeleted)
            : undefined;
          const selectedNoteArtifact = readCanvasNoteArtifact(selectedNoteElement);
          if (selectedNoteElement && selectedNoteArtifact) {
            return (
              <CanvasNoteArtifactActions
                artifact={selectedNoteArtifact}
                onOpen={() => onOpenNote(selectedNoteArtifact.noteId)}
                onToggleDisplayMode={() => updateNoteArtifact(selectedNoteElement.id, {
                  ...selectedNoteArtifact,
                  displayMode: selectedNoteArtifact.displayMode === "compact" ? "preview" : "compact",
                })}
                onDelete={() => runCanvasAction("deleteSelectedElements")}
              />
            );
          }
          const selectedCodeElement = overlayElements.find((element) => element.id === selectedElementId && !element.isDeleted);
          const selectedCodeBlock = readCanvasCodeBlock(selectedCodeElement);
          if (selectedCodeElement && selectedCodeBlock) {
            return (
              <CanvasCodeBlockActions
                block={selectedCodeBlock}
                appDark={dark}
                run={codeRuns[selectedCodeElement.id]}
                onUpdate={(block) => updateCodeBlock(selectedCodeElement.id, block)}
                onRun={() => runCodeBlock(selectedCodeElement.id, selectedCodeBlock)}
                onStop={() => stopCodeRun(selectedCodeElement.id)}
                onFitContent={() => updateCodeBlock(selectedCodeElement.id, { ...selectedCodeBlock, heightMode: "auto" })}
                onDelete={() => {
                  clearCodeRun(selectedCodeElement.id);
                  setEditingCodeBlockId(null);
                  runCanvasAction("deleteSelectedElements");
                }}
              />
            );
          }
          return (
            <CanvasSelectionActions
              api={canvasApi}
              activeTool={activeTool}
              selectedElementCount={selectedElementCount}
              onAction={runCanvasAction}
              onInteractionStateChange={setContextualInteractionActive}
            />
          );
        })()}
        tools={(
          <CanvasToolRail
          api={canvasApi}
          panelAnchorRef={panelAnchorRef}
          activeTool={activeTool}
          backgroundColor={backgroundColor}
          diagramOpen={diagramOpen}
          noteOpen={notePickerOpen}
          moreOpen={moreOpen}
          onDiagramToggle={() => { setNotePickerOpen(false); setMoreOpen(false); setDiagramOpen((open) => !open); }}
          onNoteToggle={() => { setDiagramOpen(false); setMoreOpen(false); setNotePickerOpen((open) => !open); }}
          onMoreToggle={() => { setNotePickerOpen(false); setMoreOpen((open) => !open); }}
          onCoreToolSelect={closeCanvasPopovers}
          onInsertCodeBlock={insertCodeBlock}
          onBackgroundChange={setCanvasBackground}
          onAction={runCanvasAction}
          diagramPanel={(
            <DiagramPalette
              open={diagramOpen}
              anchorRef={panelAnchorRef}
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
              onClose={() => setDiagramOpen(false)}
            />
          )}
        />
        )}
      />
      <CanvasFlowchartHandles
        anchor={canvasOverlayInteractionActive ? null : flowchartAnchor}
        previewDirection={flowchartPreviewDirection}
        onPreviewStart={beginNativeFlowchartPreview}
        onPreviewCancel={cancelNativeFlowchartPreview}
        onCommit={commitNativeFlowchartPreview}
      />

      {!hasElements && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-[40%] flex-col items-center gap-[7px] text-center text-muted">
          <span className="grid size-8 place-items-center rounded-[9px] border border-dashed border-accent text-xl text-accent">+</span>
          <strong className="text-sm font-medium text-ink">Start mapping</strong>
          <span className="whitespace-nowrap text-[11px] max-[700px]:w-[180px] max-[700px]:whitespace-normal">Add a note, shape, code block, image, connection, or structured diagram.</span>
        </div>
      )}
      <Excalidraw initialData={initialData} onInitialize={onInitialize} onChange={changed} onLibraryChange={persistLibraryItems} theme={dark ? "dark" : "light"} autoFocus={false} handleKeyboardGlobally={false} validateEmbeddable={true} UIOptions={canvasUIOptions} />
    </div>
  );
}
