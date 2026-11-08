import { exportToSvg } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawFrameLikeElement, NonDeleted, NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { appendCanvasCodeBlocksToSvg } from "./canvas-code-block-export.ts";

export type CanvasImageFormat = "png" | "svg";
export type CanvasImageExportSource = {
  elements: readonly NonDeletedExcalidrawElement[];
  appState: AppState;
  exportingFrame?: NonDeleted<ExcalidrawFrameLikeElement> | null;
};

function exportDarkMode(appState: AppState, fallback: boolean) {
  return appState.exportWithDarkMode || appState.theme === "dark" || fallback;
}

export async function createCanvasImageBlob(
  api: ExcalidrawImperativeAPI,
  appDark: boolean,
  format: CanvasImageFormat,
  source?: CanvasImageExportSource,
) {
  const appState = source?.appState ?? api.getAppState();
  const elements = source?.elements ?? api.getSceneElements();
  const exportBackground = appState.exportBackground ?? true;
  const darkMode = exportDarkMode(appState, appDark);
  const svg = await exportToSvg({
    data: {
      elements,
      appState: {
        exportBackground,
        exportWithDarkMode: appState.exportWithDarkMode,
        exportEmbedScene: appState.exportEmbedScene,
        exportScale: appState.exportScale,
        viewBackgroundColor: appState.viewBackgroundColor,
        frameRendering: appState.frameRendering,
      },
      files: api.getFiles(),
    },
    config: {
      canvasBackgroundColor: exportBackground ? appState.viewBackgroundColor : false,
      padding: 10,
      renderEmbeddables: true,
      theme: darkMode ? "dark" : "light",
      exportingFrame: source?.exportingFrame,
    },
  });
  appendCanvasCodeBlocksToSvg(svg, elements, darkMode);
  const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
  if (format === "svg") return svgBlob;

  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = Math.max(1, Math.ceil((svg.viewBox.baseVal.width || image.naturalWidth) * scale));
    canvas.height = Math.max(1, Math.ceil((svg.viewBox.baseVal.height || image.naturalHeight) * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas image export is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode the Canvas image.")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function copyCanvasImage(
  api: ExcalidrawImperativeAPI,
  appDark: boolean,
  format: CanvasImageFormat,
  source?: CanvasImageExportSource,
) {
  const blob = await createCanvasImageBlob(api, appDark, format, source);
  if (!navigator.clipboard) throw new Error("Clipboard access is unavailable in this browser.");
  if (format === "svg" && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/svg+xml": blob })]);
      return;
    } catch {
      await navigator.clipboard.writeText(await blob.text());
      return;
    }
  }
  if (format === "png" && typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }
  if (format === "svg") {
    await navigator.clipboard.writeText(await blob.text());
    return;
  }
  throw new Error("PNG clipboard export is unavailable in this browser.");
}

export async function downloadCanvasImage(
  api: ExcalidrawImperativeAPI,
  appDark: boolean,
  format: CanvasImageFormat,
  source?: CanvasImageExportSource,
  name = "notespace-canvas",
) {
  const blob = await createCanvasImageBlob(api, appDark, format, source);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  const safeName = Array.from(name, (character) => {
    const code = character.charCodeAt(0);
    return "\\/:*?\"<>|".includes(character) || code < 32 ? "-" : character;
  }).join("").trim() || "notespace-canvas";
  link.download = `${safeName}.${format}`;
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
