import { CaptureUpdateAction, Excalidraw, reconcileElements } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  LibraryItems,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../domain/project/project";
import { blobFromDataUrl, blobToDataUrl, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { DiagramPalette } from "../../features/diagram/DiagramPalette";
import {
  DIAGRAM_DATA_KEY,
  addCatalogNode,
  connectDiagramNodes,
  createDiagramWithNode,
  groupDiagramNodes,
  layoutDiagram,
  readStructuredDiagrams,
  selectionForElements,
  syncDiagramsFromElements,
  type DiagramCatalogItem,
  type DiagramSelection,
  type StructuredDiagram,
} from "../../features/diagram/diagram-model";
import { useToast } from "../../providers/toast-provider";
import { sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state";
import { replaceStructuredDiagramElements } from "./diagram-excalidraw";
import { ensureEraserDiagramIconFiles } from "./eraser-icon-files";
import { CanvasToolRail, CanvasViewControls } from "./CanvasChrome";
import { CanvasSelectionActions, type CanvasRuntimeActionName } from "./CanvasSelectionActions";

type FocusRequest = { id: string; request: number } | null;
type CanvasPeerMessage = { source: string; snapshot: Snapshot };

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
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

function readStoredLibraryItems(): LibraryItems {
  try {
    const raw = window.localStorage.getItem(EXCALIDRAW_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as LibraryItems : [];
  } catch {
    return [];
  }
}

function readCanvasFiles(data: Record<string, unknown>) {
  const files = data.files;
  return files && typeof files === "object" ? files as BinaryFiles : {};
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sceneSignature(data: Record<string, unknown>) {
  const appState = objectValue(data.appState);
  return JSON.stringify({
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
      objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
    },
    diagrams: data[DIAGRAM_DATA_KEY] ?? [],
  });
}

// Viewport state (pan/zoom) is intentionally local to each tab. Persisting it
// made ordinary navigation generate server writes and caused false conflicts.
function persistedAppState(state: AppState) {
  return {
    viewBackgroundColor: state.viewBackgroundColor,
    gridModeEnabled: state.gridModeEnabled,
    objectsSnapModeEnabled: state.objectsSnapModeEnabled,
  };
}

function mergeDiagramSets(local: readonly StructuredDiagram[], remote: readonly StructuredDiagram[]) {
  const merged = new Map(local.map((diagram) => [diagram.id, diagram]));
  for (const diagram of remote) merged.set(diagram.id, diagram);
  return [...merged.values()];
}

export default function CanvasEditor({ initial, onChange, onElementSelect, focusRequest, dark, workspaceId }: { initial: Snapshot; onChange: (snapshot: Snapshot) => void; onElementSelect?: (elementId: string | null) => void; focusRequest?: FocusRequest; dark: boolean; workspaceId: string }) {
  const { showToast } = useToast();
  const initialFiles = useRef<BinaryFiles>(readCanvasFiles(initial.data));
  const pendingFileIds = useRef(new Set<string>());
  const persistedFileIds = useRef(new Set<string>());
  const [initialData] = useState(() => {
    const data = { ...initial.data };
    delete data.files;
    delete data[DIAGRAM_DATA_KEY];
    return {
      ...data,
      appState: { viewBackgroundColor: dark ? "#1d1e24" : "#f8f9fc", ...(initial.data.appState as object) },
      files: {},
      libraryItems: readStoredLibraryItems(),
    } as ExcalidrawInitialDataState;
  });
  const [hasElements, setHasElements] = useState(() => Array.isArray(initial.data.elements) && initial.data.elements.length > 0);
  const [backgroundColor, setBackgroundColor] = useState(() => {
    const appState = objectValue(initial.data.appState);
    return typeof appState.viewBackgroundColor === "string" ? appState.viewBackgroundColor : (dark ? "#1d1e24" : "#f8f9fc");
  });
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [diagrams, setDiagrams] = useState(() => readStructuredDiagrams(initial.data));
  const diagramsRef = useRef(diagrams);
  const [diagramSelection, setDiagramSelection] = useState<DiagramSelection>({ diagramId: null, nodeIds: [] });
  const diagramSelectionRef = useRef(diagramSelection);
  const [lastDiagramId, setLastDiagramId] = useState<string | null>(() => diagrams.at(-1)?.id ?? null);
  const [activeTool, setActiveTool] = useState<AppState["activeTool"]["type"]>("selection");
  const [selectedElementCount, setSelectedElementCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [gridModeEnabled, setGridModeEnabled] = useState(false);
  const [objectsSnapModeEnabled, setObjectsSnapModeEnabled] = useState(false);
  const [canvasApi, setCanvasApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const panelAnchorRef = useRef<HTMLDivElement>(null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);
  const lastExternalScene = useRef(sceneSignature(initial.data));
  const peerId = useRef(crypto.randomUUID());
  const peerChannel = useRef<BroadcastChannel | null>(null);
  const peerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedPeerSnapshot = useRef<Snapshot | null>(null);

  const closeCanvasPopovers = useCallback(() => {
    setMoreOpen(false);
  }, []);

  const publishPeerSnapshot = useCallback((snapshot: Snapshot) => {
    if (typeof BroadcastChannel === "undefined") return;
    queuedPeerSnapshot.current = snapshot;
    if (peerTimer.current) clearTimeout(peerTimer.current);
    peerTimer.current = setTimeout(() => {
      const channel = peerChannel.current;
      const queued = queuedPeerSnapshot.current;
      queuedPeerSnapshot.current = null;
      peerTimer.current = null;
      if (channel && queued) channel.postMessage({ source: peerId.current, snapshot: queued } satisfies CanvasPeerMessage);
    }, 80);
  }, []);

  const updateDiagramState = useCallback((next: StructuredDiagram[]) => {
    if (sameStructuredDiagrams(diagramsRef.current, next)) return;
    diagramsRef.current = next;
    setDiagrams(next);
  }, []);

  const updateDiagramSelection = useCallback((next: DiagramSelection) => {
    if (sameDiagramSelection(diagramSelectionRef.current, next)) return;
    diagramSelectionRef.current = next;
    setDiagramSelection(next);
  }, []);

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
    lastExternalScene.current = sceneSignature(data);
    onChange(snapshot);
    publishPeerSnapshot(snapshot);
  }, [onChange, publishPeerSnapshot]);

  const restoreLocalFiles = useCallback(async (value: ExcalidrawImperativeAPI) => {
    const fileIds = new Set(value.getSceneElements().map((element) => "fileId" in element && typeof element.fileId === "string" ? String(element.fileId) : null).filter((fileId): fileId is string => fileId !== null));
    const files = await Promise.all([...fileIds].map(async (fileId) => {
      const source = initialFiles.current[fileId];
      let asset = await loadImageAsset(workspaceId, fileId);
      if (!asset && source) asset = await storeImageAsset(workspaceId, fileId, await blobFromDataUrl(source.dataURL));
      if (!asset) return null;
      const dataURL = await blobToDataUrl(asset.blob);
      return source
        ? { ...source, dataURL: dataURL as BinaryFileData["dataURL"], mimeType: asset.mimeType as BinaryFileData["mimeType"], lastRetrieved: Date.now() } as BinaryFileData
        : { id: fileId as BinaryFileData["id"], dataURL: dataURL as BinaryFileData["dataURL"], mimeType: asset.mimeType as BinaryFileData["mimeType"], created: asset.createdAt, lastRetrieved: Date.now() } as BinaryFileData;
    }));
    const restored = files.filter((file): file is BinaryFileData => file !== null);
    if (restored.length) value.addFiles(restored);
  }, [workspaceId]);

  const persistCanvasFiles = useCallback((files: BinaryFiles) => {
    for (const [fileId, file] of Object.entries(files)) {
      if (pendingFileIds.current.has(fileId) || persistedFileIds.current.has(fileId)) continue;
      pendingFileIds.current.add(fileId);
      void blobFromDataUrl(file.dataURL)
        .then((blob) => storeImageAsset(workspaceId, fileId, blob))
        .then(() => persistedFileIds.current.add(fileId))
        .catch((error) => showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not store this canvas image locally." }))
        .finally(() => pendingFileIds.current.delete(fileId));
    }
  }, [showToast, workspaceId]);

  const persistLibraryItems = useCallback((items: LibraryItems) => {
    try {
      window.localStorage.setItem(EXCALIDRAW_LIBRARY_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not persist the Excalidraw library in this browser." });
    }
  }, [showToast]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return undefined;
    const channel = new BroadcastChannel(`notespace.canvas:${workspaceId}`);
    peerChannel.current = channel;
    channel.onmessage = (event: MessageEvent<CanvasPeerMessage>) => {
      const message = event.data;
      if (!message || message.source === peerId.current || message.snapshot?.format !== "excalidraw") return;
      const value = api.current;
      if (!value) return;

      const remoteElements = Array.isArray(message.snapshot.data.elements)
        ? message.snapshot.data.elements as OrderedExcalidrawElement[]
        : [];
      const localElements = value.getSceneElementsIncludingDeleted();
      const mergedElements = reconcileElements(
        localElements,
        remoteElements as Parameters<typeof reconcileElements>[1],
        value.getAppState(),
      );
      // Peer tabs share authored elements, not each other's viewport/UI state.
      // This keeps pan, zoom, grid and background controls local while the scene
      // itself converges immediately.
      const localAppState = persistedAppState(value.getAppState());
      const seedDiagrams = mergeDiagramSets(diagramsRef.current, readStructuredDiagrams(message.snapshot.data));
      const nextDiagrams = syncDiagramsFromElements(seedDiagrams, mergedElements);
      const data = {
        elements: mergedElements,
        appState: localAppState,
        files: {},
        [DIAGRAM_DATA_KEY]: nextDiagrams,
      };
      const serialized = JSON.stringify(data);
      if (serialized === last.current) return;

      last.current = serialized;
      lastExternalScene.current = sceneSignature(data);
      updateDiagramState(nextDiagrams);
      setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
      setHasElements(mergedElements.some((element) => !element.isDeleted));

      value.updateScene({
        elements: mergedElements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      onChange({ format: "excalidraw", version: 1, data });
    };

    return () => {
      if (peerTimer.current) clearTimeout(peerTimer.current);
      peerTimer.current = null;
      queuedPeerSnapshot.current = null;
      peerChannel.current = null;
      channel.close();
    };
  }, [onChange, updateDiagramState, workspaceId]);

  useEffect(() => {
    if (!api.current) return;
    const signature = sceneSignature(initial.data);
    if (signature === lastExternalScene.current) return;
    const elements = Array.isArray(initial.data.elements) ? initial.data.elements as OrderedExcalidrawElement[] : [];
    const nextDiagrams = readStructuredDiagrams(initial.data);
    updateDiagramState(nextDiagrams);
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    setHasElements(elements.length > 0);
    api.current.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    lastExternalScene.current = signature;
  }, [initial, updateDiagramState]);

  useEffect(() => {
    if (!focusRequest || !api.current) return;
    const element = api.current.getSceneElements().find((candidate) => candidate.id === focusRequest.id && !candidate.isDeleted);
    if (!element) return;
    api.current.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    api.current.setViewport({ target: element, fit: "scale-down", animation: { duration: 250 } });
  }, [focusRequest]);

  const changed = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, files: BinaryFiles) => {
    setActiveTool(state.activeTool.type);
    const selectedIds = Object.entries(state.selectedElementIds).filter(([, value]) => value).map(([id]) => id);
    setSelectedElementCount(selectedIds.length);
    setZoom(state.zoom.value);
    setGridModeEnabled(state.gridModeEnabled);
    setObjectsSnapModeEnabled(state.objectsSnapModeEnabled);
    setBackgroundColor(state.viewBackgroundColor);
    const selected = selectedIds[0] ?? null;
    if (selected !== lastSelected.current) { lastSelected.current = selected; onElementSelect?.(selected); }
    setHasElements(elements.some((element) => !element.isDeleted));

    const nextDiagrams = syncDiagramsFromElements(diagramsRef.current, elements);
    updateDiagramState(nextDiagrams);
    updateDiagramSelection(selectionForElements(nextDiagrams, selectedIds, elements));

    const data = {
      elements,
      appState: persistedAppState(state),
      files: {},
      [DIAGRAM_DATA_KEY]: nextDiagrams,
    };
    persistCanvasFiles(files);
    const serialized = JSON.stringify(data);
    if (serialized === last.current) return;
    const first = last.current === "";
    last.current = serialized;
    lastExternalScene.current = sceneSignature(data);
    if (!first) {
      const snapshot: Snapshot = { format: "excalidraw", version: 1, data };
      onChange(snapshot);
      publishPeerSnapshot(snapshot);
    }
  }, [onChange, onElementSelect, persistCanvasFiles, publishPeerSnapshot, updateDiagramSelection, updateDiagramState]);

  const onInitialize = useCallback((value: ExcalidrawImperativeAPI) => {
    api.current = value;
    setCanvasApi(value);
    setZoom(value.getAppState().zoom.value);
    setGridModeEnabled(value.getAppState().gridModeEnabled);
    setObjectsSnapModeEnabled(value.getAppState().objectsSnapModeEnabled);
    if (!window.name) window.name = "notespace";
    void restoreLocalFiles(value);
  }, [restoreLocalFiles]);

  useEffect(() => {
    if (!canvasApi) return undefined;

    const importLibraryFromHash = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const libraryUrl = params.get("addLibrary");
      if (!libraryUrl) return;
      const token = params.get("token") ?? undefined;

      void Promise.resolve(canvasApi.importLibrary(libraryUrl, token))
        .then(() => {
          if (new URLSearchParams(window.location.hash.slice(1)).has("addLibrary")) {
            window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
          }
        })
        .catch((error) => {
          showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not import the Excalidraw library." });
        });
    };

    importLibraryFromHash();
    window.addEventListener("hashchange", importLibraryFromHash);
    return () => window.removeEventListener("hashchange", importLibraryFromHash);
  }, [canvasApi, showToast]);

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

  const activeDiagram = useMemo(() => {
    const id = diagramSelection.diagramId ?? lastDiagramId ?? diagrams.at(-1)?.id ?? null;
    return id ? diagrams.find((diagram) => diagram.id === id) ?? null : null;
  }, [diagramSelection.diagramId, diagrams, lastDiagramId]);

  const canvasOrigin = useCallback(() => {
    const state = api.current?.getAppState();
    return { x: -(state?.scrollX ?? 0) + 120, y: -(state?.scrollY ?? 0) + 120 };
  }, []);

  const canvasPointFromClient = useCallback((clientX: number, clientY: number) => {
    const value = api.current;
    if (!value || typeof document === "undefined") return canvasOrigin();
    const target = document.elementFromPoint(clientX, clientY);
    const surface = target instanceof Element ? target.closest(".notespace-canvas-surface") : null;
    if (!(surface instanceof HTMLElement)) return canvasOrigin();
    const bounds = surface.getBoundingClientRect();
    const state = value.getAppState();
    const scale = state.zoom.value || 1;
    return {
      x: (clientX - bounds.left) / scale - state.scrollX - 28,
      y: (clientY - bounds.top) / scale - state.scrollY - 28,
    };
  }, [canvasOrigin]);

  const applyDiagram = useCallback(async (previous: StructuredDiagram | null, next: StructuredDiagram) => {
    const value = api.current;
    if (!value) return;
    await document.fonts.ready;
    const iconLoad = await ensureEraserDiagramIconFiles(value, next, workspaceId);
    if (iconLoad.failed.length) {
      showToast({ kind: "error", message: "Some Eraser icons could not load. Text fallback was kept for those nodes." });
    }
    const nextElements = replaceStructuredDiagramElements(value.getSceneElements(), previous, next, dark, iconLoad.available);
    const nextDiagrams = previous
      ? diagramsRef.current.map((diagram) => diagram.id === previous.id ? next : diagram)
      : [...diagramsRef.current, next];
    updateDiagramState(nextDiagrams);
    setLastDiagramId(next.id);
    updateDiagramSelection({ diagramId: next.id, nodeIds: [] });
    value.updateScene({ elements: nextElements, appState: { selectedElementIds: {} } });
    emitSnapshot(nextElements, value.getAppState(), nextDiagrams);
  }, [dark, emitSnapshot, showToast, updateDiagramSelection, updateDiagramState, workspaceId]);

  const insertNode = useCallback((item: DiagramCatalogItem, drop?: { clientX: number; clientY: number }) => {
    const droppedOrigin = drop ? canvasPointFromClient(drop.clientX, drop.clientY) : null;
    const currentDiagram = activeDiagram;
    if (!currentDiagram) {
      void applyDiagram(null, createDiagramWithNode("architecture", item, droppedOrigin ?? canvasOrigin(), undefined, "icon"));
      return;
    }
    const tail = currentDiagram.nodes.at(-1);
    const origin = droppedOrigin ?? (tail ? { x: tail.x + 96, y: tail.y } : canvasOrigin());
    void applyDiagram(currentDiagram, addCatalogNode(currentDiagram, item, origin, undefined, "icon"));
  }, [activeDiagram, applyDiagram, canvasOrigin, canvasPointFromClient]);

  const connectSelected = useCallback(() => {
    if (!activeDiagram || diagramSelection.nodeIds.length !== 2) return;
    void applyDiagram(activeDiagram, connectDiagramNodes(activeDiagram, diagramSelection.nodeIds[0], diagramSelection.nodeIds[1]));
  }, [activeDiagram, applyDiagram, diagramSelection.nodeIds]);

  const groupSelected = useCallback(() => {
    if (!activeDiagram || diagramSelection.nodeIds.length < 2) return;
    void applyDiagram(activeDiagram, groupDiagramNodes(activeDiagram, diagramSelection.nodeIds));
  }, [activeDiagram, applyDiagram, diagramSelection.nodeIds]);

  const autoLayout = useCallback(() => {
    if (!activeDiagram) return;
    void applyDiagram(activeDiagram, layoutDiagram(activeDiagram));
  }, [activeDiagram, applyDiagram]);

  const detachDiagram = useCallback(() => {
    if (!activeDiagram || !api.current) return;
    const nextDiagrams = diagramsRef.current.filter((diagram) => diagram.id !== activeDiagram.id);
    updateDiagramState(nextDiagrams);
    updateDiagramSelection({ diagramId: null, nodeIds: [] });
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    emitSnapshot(api.current.getSceneElements(), api.current.getAppState(), nextDiagrams);
    showToast({ kind: "success", message: "Diagram detached. Its Excalidraw shapes remain fully editable." });
  }, [activeDiagram, emitSnapshot, showToast, updateDiagramSelection, updateDiagramState]);

  return (
    <div className="notespace-canvas-surface relative min-h-0 w-full flex-1" aria-label="Workspace canvas">
      <div className="pointer-events-auto absolute top-1/2 left-2 z-[100] isolate -translate-y-1/2">
        <CanvasToolRail
          api={canvasApi}
          panelAnchorRef={panelAnchorRef}
          activeTool={activeTool}
          backgroundColor={backgroundColor}
          diagramOpen={diagramOpen}
          moreOpen={moreOpen}
          onDiagramToggle={() => { setMoreOpen(false); setDiagramOpen((open) => !open); }}
          onMoreToggle={() => { setMoreOpen((open) => !open); }}
          onCoreToolSelect={closeCanvasPopovers}
          onBackgroundChange={setCanvasBackground}
          onAction={runCanvasAction}
          diagramPanel={(
            <DiagramPalette
              open={diagramOpen}
              anchorRef={panelAnchorRef}
              activeDiagram={Boolean(activeDiagram)}
              selectedNodeCount={diagramSelection.nodeIds.length}
              onInsertNode={insertNode}
              onConnect={connectSelected}
              onGroup={groupSelected}
              onAutoLayout={autoLayout}
              onDetach={detachDiagram}
              onClose={() => setDiagramOpen(false)}
            />
          )}
        />
      </div>
      <CanvasViewControls api={canvasApi} zoom={zoom} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} onAction={runCanvasAction} />
      <CanvasSelectionActions api={canvasApi} activeTool={activeTool} selectedElementCount={selectedElementCount} onAction={runCanvasAction} />

      {!hasElements && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-[40%] flex-col items-center gap-[7px] text-center text-muted">
          <span className="grid size-8 place-items-center rounded-[9px] border border-dashed border-accent text-xl text-accent">+</span>
          <strong className="text-sm font-medium text-ink">Start mapping</strong>
          <span className="whitespace-nowrap text-[11px] max-[700px]:w-[180px] max-[700px]:whitespace-normal">Add a note, shape, image, connection, or structured diagram.</span>
        </div>
      )}
      <Excalidraw initialData={initialData} onInitialize={onInitialize} onChange={changed} onLibraryChange={persistLibraryItems} theme={dark ? "dark" : "light"} autoFocus={false} handleKeyboardGlobally={false} validateEmbeddable={false} UIOptions={canvasUIOptions} />
    </div>
  );
}
