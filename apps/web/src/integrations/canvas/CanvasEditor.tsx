import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../domain/project/project";
import { blobFromDataUrl, blobToDataUrl, loadImageAsset, storeImageAsset } from "../../domain/assets/local-image-assets";
import { useToast } from "../../providers/toast-provider";
import "./canvas-editor.css";

type FocusRequest = { id: string; request: number } | null;

// Excalidraw uses object identity for parts of its internal configuration.
// Keep this stable so parent Workspace renders do not reconfigure the editor.
const canvasUIOptions = {
  canvasActions: {
    loadScene: true,
    saveToActiveFile: false,
    export: { saveFileToDisk: true },
    toggleTheme: false,
    saveAsImage: true,
  },
  tools: {
    image: true,
  },
};

// Host fonts on the same instance; the editor must not depend on a public CDN.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string;
  }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

function readCanvasFiles(data: Record<string, unknown>) {
  const files = data.files;
  return files && typeof files === "object" ? files as BinaryFiles : {};
}

function sceneSignature(data: Record<string, unknown>) {
  const appState = data.appState && typeof data.appState === "object"
    ? data.appState as Record<string, unknown>
    : {};
  return JSON.stringify({
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
      viewBackgroundColor: appState.viewBackgroundColor,
    },
  });
}

export default function CanvasEditor({
  initial,
  onChange,
  onElementSelect,
  focusRequest,
  dark,
  workspaceId,
}: {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  onElementSelect?: (elementId: string | null) => void;
  focusRequest?: FocusRequest;
  dark: boolean;
  workspaceId: string;
}) {
  const { showToast } = useToast();
  const initialFiles = useRef<BinaryFiles>(readCanvasFiles(initial.data));
  const pendingFileIds = useRef(new Set<string>());
  const persistedFileIds = useRef(new Set<string>());
  const [initialData] = useState(
    () => {
      const data = { ...initial.data };
      delete data.files;
      return {
        ...data,
        appState: {
          viewBackgroundColor: dark ? "#1d1e24" : "#f8f9fc",
          ...(initial.data.appState as object),
        },
        files: {},
      } as ExcalidrawInitialDataState;
    },
  );
  const [hasElements, setHasElements] = useState(() => Array.isArray(initial.data.elements) && initial.data.elements.length > 0);
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);
  const lastExternalScene = useRef(sceneSignature(initial.data));

  const restoreLocalFiles = useCallback(async (value: ExcalidrawImperativeAPI) => {
    const fileIds = new Set(
      value.getSceneElements()
        .map((element) => "fileId" in element && typeof element.fileId === "string" ? String(element.fileId) : null)
        .filter((fileId): fileId is string => fileId !== null),
    );
    const files = await Promise.all([...fileIds].map(async (fileId) => {
      const source = initialFiles.current[fileId];
      let asset = await loadImageAsset(workspaceId, fileId);
      if (!asset && source) {
        asset = await storeImageAsset(workspaceId, fileId, await blobFromDataUrl(source.dataURL));
      }
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
    const elements = Array.isArray(initial.data.elements)
      ? initial.data.elements as OrderedExcalidrawElement[]
      : [];
    setHasElements(elements.length > 0);
    api.current.updateScene({ elements });
    lastExternalScene.current = signature;
  }, [initial]);

  useEffect(() => {
    if (!focusRequest || !api.current) return;
    const element = api.current
      .getSceneElements()
      .find(
        (candidate) =>
          candidate.id === focusRequest.id && !candidate.isDeleted,
      );
    if (!element) return;
    api.current.updateScene({
      appState: { selectedElementIds: { [element.id]: true } },
    });
    api.current.setViewport({
      target: element,
      fit: "scale-down",
      animation: { duration: 250 },
    });
  }, [focusRequest]);

  const changed = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    state: AppState,
    files: BinaryFiles,
  ) => {
    const selected =
      Object.entries(state.selectedElementIds).find(([, value]) => value)?.[0] ??
      null;
    if (selected !== lastSelected.current) {
      lastSelected.current = selected;
      onElementSelect?.(selected);
    }
    setHasElements(elements.length > 0);

    // Selection, cursor, menus and collaborators are transient. Only resume-relevant state is stored.
    const data = {
      elements,
      appState: {
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom,
        viewBackgroundColor: state.viewBackgroundColor,
      },
      // Image binaries stay in the browser's IndexedDB asset vault; the API only receives scene metadata.
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

  return (
    <div className="canvas-editor" aria-label="Workspace canvas">
      {!hasElements && <div className="canvas-empty-hint" aria-hidden="true"><span className="canvas-empty-icon">+</span><strong>Start mapping</strong><span>Add a note, shape, image, or connection.</span></div>}
      {/* The pinned @dwelle build includes Excalidraw's native bucket-fill tool. */}
      <Excalidraw
        initialData={initialData}
        onInitialize={onInitialize}
        onChange={changed}
        theme={dark ? "dark" : "light"}
        autoFocus={false}
        handleKeyboardGlobally={false}
        validateEmbeddable={false}
        UIOptions={canvasUIOptions}
      >
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
