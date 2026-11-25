import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect, useRef, type RefObject } from "react";
import { readCanvasNoteReference, type NoteDocument } from "../../../entities/note";
import type { ToastInput } from "../../../shared/ui/feedback/toast-provider";
import {
  interceptNativeImageExportActions,
  interceptNativeImageExportCallback,
  type NativeImageExportAction,
} from "./excalidraw-bridge/CanvasNativeActions";
import type { CodeBlockViewOptions } from "../objects/code-block/CanvasCodeBlockLayer";
import { copyCanvasImage, downloadCanvasImage } from "../objects/code-block/canvas-code-block-export-actions";
import { readCanvasCodeBlock } from "../objects/code-block/model/canvas-code-block";

export function useCanvasExportBridge({
  canvasApi,
  apiRef,
  dark,
  codeBlockViews,
  readNoteDocuments,
  showToast,
}: {
  canvasApi: ExcalidrawImperativeAPI | null;
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  dark: boolean;
  codeBlockViews: Record<string, CodeBlockViewOptions>;
  readNoteDocuments: () => Record<string, NoteDocument>;
  showToast: (input: ToastInput) => string;
}) {
  const nativeImageExportRef = useRef<(name: NativeImageExportAction) => boolean>(() => false);
  nativeImageExportRef.current = (name) => {
    const currentApi = apiRef.current;
    if (!currentApi || !currentApi.getSceneElements().some((element) => readCanvasCodeBlock(element) || readCanvasNoteReference(element))) return false;
    if (name === "imageExport") {
      currentApi.app.setOpenDialog({ name: "imageExport" });
      return true;
    }
    const format = name === "copyAsPng" ? "png" : "svg";
    const appState = currentApi.getAppState();
    const scene = currentApi.getSceneElements();
    const selected = scene.filter((element) => appState.selectedElementIds[element.id]);
    const source = {
      elements: selected.length ? selected : scene,
      appState,
      codeBlockViews,
      noteDocuments: readNoteDocuments(),
    };
    void copyCanvasImage(currentApi, dark, format, source).then(() => {
      showToast({ kind: "success", message: `${format.toUpperCase()} copied.` });
    }).catch((error: unknown) => {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not copy the Canvas image." });
    });
    return true;
  };

  useEffect(() => {
    if (!canvasApi) return;
    return interceptNativeImageExportActions(canvasApi, (name) => nativeImageExportRef.current(name));
  }, [canvasApi]);

  useEffect(() => {
    if (!canvasApi) return;
    return interceptNativeImageExportCallback(canvasApi, async (type, elements, options) => {
      if (!elements.some((element) => readCanvasCodeBlock(element) || readCanvasNoteReference(element))) return false;
      const appState = canvasApi.getAppState();
      const source = {
        elements,
        appState,
        exportingFrame: options.exportingFrame,
        codeBlockViews,
        noteDocuments: readNoteDocuments(),
      };
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
  }, [canvasApi, codeBlockViews, readNoteDocuments, showToast]);
}
