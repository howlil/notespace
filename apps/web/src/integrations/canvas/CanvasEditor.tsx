import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Network } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../domain/project/project";
import { blobFromDataUrl, blobToDataUrl, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { Button } from "../../components/ui";
import { DiagramPalette } from "../../features/diagram/DiagramPalette";
import {
  DIAGRAM_DATA_KEY,
  NODE_WIDTH,
  addCatalogNode,
  connectDiagramNodes,
  createDiagramWithNode,
  createStarterDiagram,
  groupDiagramNodes,
  layoutDiagram,
  readStructuredDiagrams,
  selectionForElements,
  syncDiagramsFromElements,
  type DiagramCatalogItem,
  type DiagramKind,
  type DiagramSelection,
  type StructuredDiagram,
} from "../../features/diagram/diagram-model";
import { useToast } from "../../providers/toast-provider";
import { sameDiagramSelection, sameStructuredDiagrams } from "./canvas-state";
import { replaceStructuredDiagramElements } from "./diagram-excalidraw";

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

declare global {
  interface Window { EXCALIDRAW_ASSET_PATH: string; }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

function readCanvasFiles(data: Record<string, unknown>) {
  const files = data.files;
  return files && typeof files === "object" ? files as BinaryFiles : {};
}

function sceneSignature(data: Record<string, unknown>) {
  const appState = data.appState && typeof data.appState === "object" ? data.appState as Record<string, unknown> : {};
  return JSON.stringify({
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom, viewBackgroundColor: appState.viewBackgroundColor },
    diagrams: data[DIAGRAM_DATA_KEY] ?? [],
  });
}

function persistedAppState(state: AppState) {
  return { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom, viewBackgroundColor: state.viewBackgroundColor };
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
    } as ExcalidrawInitialDataState;
  });
  const [hasElements, setHasElements] = useState(() => Array.isArray(initial.data.elements) && initial.data.elements.length > 0);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [diagramKind, setDiagramKind] = useState<DiagramKind>("architecture");
  const [diagrams, setDiagrams] = useState(() => readStructuredDiagrams(initial.data));
  const diagramsRef = useRef(diagrams);
  const [diagramSelection, setDiagramSelection] = useState<DiagramSelection>({ diagramId: null, nodeIds: [] });
  const diagramSelectionRef = useRef(diagramSelection);
  const [lastDiagramId, setLastDiagramId] = useState<string | null>(() => diagrams.at(-1)?.id ?? null);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);
  const lastExternalScene = useRef(sceneSignature(initial.data));

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
    const serialized = JSON.stringify(data);
    last.current = serialized;
    lastExternalScene.current = sceneSignature(data);
    onChange({ format: "excalidraw", version: 1, data });
  }, [onChange]);

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

  useEffect(() => {
    if (!api.current) return;
    const signature = sceneSignature(initial.data);
    if (signature === lastExternalScene.current) return;
    const elements = Array.isArray(initial.data.elements) ? initial.data.elements as OrderedExcalidrawElement[] : [];
    const nextDiagrams = readStructuredDiagrams(initial.data);
    updateDiagramState(nextDiagrams);
    setLastDiagramId(nextDiagrams.at(-1)?.id ?? null);
    setHasElements(elements.length > 0);
    api.current.updateScene({ elements });
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
    const selectedIds = Object.entries(state.selectedElementIds).filter(([, value]) => value).map(([id]) => id);
    const selected = selectedIds[0] ?? null;
    if (selected !== lastSelected.current) { lastSelected.current = selected; onElementSelect?.(selected); }
    setHasElements(elements.length > 0);

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
    if (!first) onChange({ format: "excalidraw", version: 1, data });
  }, [onChange, onElementSelect, persistCanvasFiles, updateDiagramSelection, updateDiagramState]);

  const onInitialize = useCallback((value: ExcalidrawImperativeAPI) => {
    api.current = value;
    void restoreLocalFiles(value);
  }, [restoreLocalFiles]);

  const activeDiagram = useMemo(() => {
    const id = diagramSelection.diagramId ?? lastDiagramId ?? diagrams.at(-1)?.id ?? null;
    return id ? diagrams.find((diagram) => diagram.id === id) ?? null : null;
  }, [diagramSelection.diagramId, diagrams, lastDiagramId]);

  const canvasOrigin = useCallback(() => {
    const state = api.current?.getAppState();
    return { x: -(state?.scrollX ?? 0) + 120, y: -(state?.scrollY ?? 0) + 120 };
  }, []);

  const applyDiagram = useCallback(async (previous: StructuredDiagram | null, next: StructuredDiagram) => {
    const value = api.current;
    if (!value) return;
    await document.fonts.ready;
    const nextElements = replaceStructuredDiagramElements(value.getSceneElements(), previous, next, dark);
    const nextDiagrams = previous
      ? diagramsRef.current.map((diagram) => diagram.id === previous.id ? next : diagram)
      : [...diagramsRef.current, next];
    updateDiagramState(nextDiagrams);
    setLastDiagramId(next.id);
    updateDiagramSelection({ diagramId: next.id, nodeIds: [] });
    value.updateScene({ elements: nextElements });
    emitSnapshot(nextElements, value.getAppState(), nextDiagrams);
  }, [dark, emitSnapshot, updateDiagramSelection, updateDiagramState]);

  const createStarter = useCallback((kind: DiagramKind) => {
    void applyDiagram(null, createStarterDiagram(kind, canvasOrigin()));
  }, [applyDiagram, canvasOrigin]);

  const insertNode = useCallback((item: DiagramCatalogItem) => {
    const current = activeDiagram;
    if (!current) {
      void applyDiagram(null, createDiagramWithNode(diagramKind, item, canvasOrigin()));
      return;
    }
    const tail = current.nodes.at(-1);
    const origin = tail ? { x: tail.x + NODE_WIDTH + 72, y: tail.y } : canvasOrigin();
    void applyDiagram(current, addCatalogNode(current, item, origin));
  }, [activeDiagram, applyDiagram, canvasOrigin, diagramKind]);

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
    <div
      className="relative min-h-0 w-full flex-1 [&_.App-menu_bottom]:hidden [&_.App-menu_bottom]:border-transparent [&_.App-menu_bottom]:bg-transparent [&_.App-toolbar]:border-0 [&_.App-toolbar]:bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] [&_.App-toolbar]:shadow-none [&_.App-toolbar]:border-[color-mix(in_srgb,var(--line)_65%,transparent)] [&_.excalidraw_.Island]:border-0 [&_.excalidraw_.Island]:bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] [&_.excalidraw_.Island]:shadow-none [&_.excalidraw_.FixedSideContainer]:opacity-[.86]"
      aria-label="Workspace canvas"
    >
      <div className="absolute top-2.5 right-3 z-[20]" onPointerDown={(event) => event.stopPropagation()}>
        <Button
          variant={diagramOpen ? "secondary" : "ghost"}
          size="sm"
          aria-label="Diagram tools"
          aria-expanded={diagramOpen}
          onClick={() => setDiagramOpen((open) => !open)}
          className={diagramOpen ? "border-accent bg-tint text-ink" : "bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)]"}
        >
          <Network size={13} /> Diagram
        </Button>
      </div>

      <DiagramPalette
        open={diagramOpen}
        kind={diagramKind}
        activeDiagram={Boolean(activeDiagram)}
        selectedNodeCount={diagramSelection.nodeIds.length}
        onKindChange={setDiagramKind}
        onCreateStarter={createStarter}
        onInsertNode={insertNode}
        onConnect={connectSelected}
        onGroup={groupSelected}
        onAutoLayout={autoLayout}
        onDetach={detachDiagram}
        onClose={() => setDiagramOpen(false)}
      />

      {!hasElements && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-[40%] flex-col items-center gap-[7px] text-center text-muted">
          <span className="grid size-8 place-items-center rounded-[9px] border border-dashed border-accent text-xl text-accent">+</span>
          <strong className="text-sm font-medium text-ink">Start mapping</strong>
          <span className="whitespace-nowrap text-[11px] max-[700px]:w-[180px] max-[700px]:whitespace-normal">Add a note, shape, image, connection, or structured diagram.</span>
        </div>
      )}
      <Excalidraw initialData={initialData} onInitialize={onInitialize} onChange={changed} theme={dark ? "dark" : "light"} autoFocus={false} handleKeyboardGlobally={false} validateEmbeddable={false} UIOptions={canvasUIOptions}>
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.Export />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
