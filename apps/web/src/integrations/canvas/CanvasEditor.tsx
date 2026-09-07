import { Excalidraw, MainMenu, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Network } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../domain/project/project";
import { blobFromDataUrl, blobToDataUrl, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";
import DiagramPalette from "./DiagramPalette";
import {
  buildArchitectureTemplate,
  buildDiagramNode,
  buildFlowchartTemplate,
  type DiagramCatalogItem,
  type DiagramSkeleton,
} from "./diagram";

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
  });
}

function nextDiagramOrigin(value: ExcalidrawImperativeAPI) {
  const elements = value.getSceneElements().filter((element) => !element.isDeleted);
  if (elements.length === 0) return { x: 80, y: 80 };
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const top = Math.min(...elements.map((element) => element.y));
  return { x: right + 100, y: top };
}

function diagramId(prefix: string) {
  return `notespace-${prefix}-${crypto.randomUUID()}`;
}

export default function CanvasEditor({ initial, onChange, onElementSelect, focusRequest, dark, workspaceId }: { initial: Snapshot; onChange: (snapshot: Snapshot) => void; onElementSelect?: (elementId: string | null) => void; focusRequest?: FocusRequest; dark: boolean; workspaceId: string }) {
  const { showToast } = useToast();
  const initialFiles = useRef<BinaryFiles>(readCanvasFiles(initial.data));
  const pendingFileIds = useRef(new Set<string>());
  const persistedFileIds = useRef(new Set<string>());
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [initialData] = useState(() => {
    const data = { ...initial.data };
    delete data.files;
    return {
      ...data,
      appState: { viewBackgroundColor: dark ? "#1d1e24" : "#f8f9fc", ...(initial.data.appState as object) },
      files: {},
    } as ExcalidrawInitialDataState;
  });
  const [hasElements, setHasElements] = useState(() => Array.isArray(initial.data.elements) && initial.data.elements.length > 0);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);
  const lastExternalScene = useRef(sceneSignature(initial.data));

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
    setHasElements(elements.length > 0);
    api.current.updateScene({ elements });
    lastExternalScene.current = signature;
  }, [initial]);

  useEffect(() => {
    if (!focusRequest || !api.current) return;
    const element = api.current.getSceneElements().find((candidate) => candidate.id === focusRequest.id && !candidate.isDeleted);
    if (!element) return;
    api.current.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
    api.current.setViewport({ target: element, fit: "scale-down", animation: { duration: 250 } });
  }, [focusRequest]);

  const changed = useCallback((elements: readonly OrderedExcalidrawElement[], state: AppState, files: BinaryFiles) => {
    const selected = Object.entries(state.selectedElementIds).find(([, value]) => value)?.[0] ?? null;
    if (selected !== lastSelected.current) { lastSelected.current = selected; onElementSelect?.(selected); }
    setHasElements(elements.length > 0);
    const data = {
      elements,
      appState: { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom, viewBackgroundColor: state.viewBackgroundColor },
      files: {},
    };
    persistCanvasFiles(files);
    const serialized = JSON.stringify(data);
    if (serialized === last.current) return;
    const first = last.current === "";
    last.current = serialized;
    lastExternalScene.current = serialized;
    if (!first) onChange({ format: "excalidraw", version: 1, data });
  }, [onChange, onElementSelect, persistCanvasFiles]);

  const onInitialize = useCallback((value: ExcalidrawImperativeAPI) => {
    api.current = value;
    void restoreLocalFiles(value);
  }, [restoreLocalFiles]);

  const insertDiagram = useCallback(async (skeletons: DiagramSkeleton[]) => {
    const value = api.current;
    if (!value) return;
    await document.fonts.ready;
    const converted = convertToExcalidrawElements(skeletons as Parameters<typeof convertToExcalidrawElements>[0], { regenerateIds: false });
    value.updateScene({ elements: [...value.getSceneElements(), ...converted] });
  }, []);

  const insertItem = useCallback((item: DiagramCatalogItem) => {
    const value = api.current;
    if (!value) return;
    const origin = nextDiagramOrigin(value);
    void insertDiagram(buildDiagramNode(item, origin, diagramId(item.id)));
  }, [insertDiagram]);

  const insertArchitecture = useCallback(() => {
    const value = api.current;
    if (!value) return;
    void insertDiagram(buildArchitectureTemplate(nextDiagramOrigin(value), diagramId("architecture")));
    setDiagramOpen(false);
  }, [insertDiagram]);

  const insertFlowchart = useCallback(() => {
    const value = api.current;
    if (!value) return;
    void insertDiagram(buildFlowchartTemplate(nextDiagramOrigin(value), diagramId("flowchart")));
    setDiagramOpen(false);
  }, [insertDiagram]);

  return (
    <div className="relative min-h-0 w-full flex-1 [&_.App-menu_bottom]:hidden [&_.App-menu_bottom]:border-transparent [&_.App-menu_bottom]:bg-transparent [&_.App-toolbar]:border-0 [&_.App-toolbar]:bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] [&_.App-toolbar]:shadow-none [&_.App-toolbar]:border-[color-mix(in_srgb,var(--line)_65%,transparent)] [&_.excalidraw_.Island]:border-0 [&_.excalidraw_.Island]:bg-[color-mix(in_srgb,var(--canvas)_88%,transparent)] [&_.excalidraw_.Island]:shadow-none [&_.excalidraw_.FixedSideContainer]:opacity-[.86]" aria-label="Workspace canvas">
      {!diagramOpen && (
        <button type="button" onClick={() => setDiagramOpen(true)} className="absolute right-3 top-3 z-[5] flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-2.5 text-xs font-medium text-[var(--ink)] backdrop-blur hover:border-[var(--accent)] hover:bg-[var(--tint)]" aria-label="Open diagram palette">
          <Network size={14} /> Diagram
        </button>
      )}
      {diagramOpen && <DiagramPalette onClose={() => setDiagramOpen(false)} onInsert={insertItem} onInsertArchitecture={insertArchitecture} onInsertFlowchart={insertFlowchart} />}
      {!hasElements && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1] flex -translate-x-1/2 -translate-y-[40%] flex-col items-center gap-[7px] text-center text-muted">
          <span className="grid size-8 place-items-center rounded-[9px] border border-dashed border-accent text-xl text-accent">+</span>
          <strong className="text-sm font-medium text-ink">Start mapping</strong>
          <span className="whitespace-nowrap text-[11px] max-[700px]:w-[180px] max-[700px]:whitespace-normal">Add a note, shape, image, connection, or diagram.</span>
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
