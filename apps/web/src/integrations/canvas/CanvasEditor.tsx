import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useEffect, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../domain/project/project";

type FocusRequest = { id: string; request: number } | null;

// Host fonts on the same instance; the editor must not depend on a public CDN.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string;
  }
}
window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

export default function CanvasEditor({
  initial,
  onChange,
  onElementSelect,
  focusRequest,
  dark,
}: {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  onElementSelect?: (elementId: string | null) => void;
  focusRequest?: FocusRequest;
  dark: boolean;
}) {
  const [initialData] = useState(
    () =>
      ({
        ...initial.data,
        appState: {
          viewBackgroundColor: "#f8f9fc",
          ...(initial.data.appState as object),
        },
      }) as ExcalidrawInitialDataState,
  );
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const last = useRef("");
  const lastSelected = useRef<string | null>(null);

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
    api.current.scrollToContent(element, {
      fitToContent: true,
      animate: true,
    });
  }, [focusRequest]);

  function changed(
    elements: readonly OrderedExcalidrawElement[],
    state: AppState,
    files: BinaryFiles,
  ) {
    const selected =
      Object.entries(state.selectedElementIds).find(([, value]) => value)?.[0] ??
      null;
    if (selected !== lastSelected.current) {
      lastSelected.current = selected;
      onElementSelect?.(selected);
    }

    // Selection, cursor, menus and collaborators are transient. Only resume-relevant state is stored.
    const data = {
      elements,
      appState: {
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom,
        viewBackgroundColor: state.viewBackgroundColor,
      },
      files,
    };
    const serialized = JSON.stringify(data);
    if (serialized === last.current) return;
    const first = last.current === "";
    last.current = serialized;
    if (!first) onChange({ format: "excalidraw", version: 1, data });
  }
  return (
    <div className="canvas-editor" aria-label="Project canvas">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(value) => {
          api.current = value;
        }}
        onChange={changed}
        theme={dark ? "dark" : "light"}
        autoFocus={false}
        handleKeyboardGlobally={false}
        validateEmbeddable={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            toggleTheme: false,
            saveAsImage: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
