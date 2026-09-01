import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import type { Snapshot } from "../../domain/project/project";

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
  dark,
}: {
  initial: Snapshot;
  onChange: (snapshot: Snapshot) => void;
  onElementSelect?: (elementId: string | null) => void;
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
  const last = useRef("");
  function changed(
    elements: readonly OrderedExcalidrawElement[],
    state: AppState,
    files: BinaryFiles,
  ) {
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
    const selected = Object.entries(state.selectedElementIds).find(([, selected]) => selected)?.[0] ?? null;
    onElementSelect?.(selected);
  }
  return (
    <div className="canvas-editor" aria-label="Project canvas">
      <Excalidraw
        initialData={initialData}
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
