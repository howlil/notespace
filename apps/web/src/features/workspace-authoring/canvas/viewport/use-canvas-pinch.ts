import { useEffect, type RefObject } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { canvasPinchViewport } from "./canvas-pinch-zoom";

export function useCanvasPinch(surfaceRef: RefObject<HTMLDivElement | null>, api: RefObject<ExcalidrawImperativeAPI | null>) {
  useEffect(() => {
    // Excalidraw's wheel handler accepts only select DOM targets. The authoring
    // overlays can therefore swallow a trackpad pinch, especially in WebView2.
    // Capture modified wheel before the Excalidraw handler; normal two-finger
    // scrolling still reaches Excalidraw as pan, with no double zoom.
    const surface = surfaceRef.current;
    if (!surface) return;
    const handlePinch = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(".excalidraw__canvas, [data-canvas-code-block]")) return;
      if (target.closest('input, textarea, select, button, [contenteditable="true"], [role="toolbar"], iframe')) return;

      const editor = api.current;
      if (!editor) return;
      const state = editor.getAppState();
      const next = canvasPinchViewport({
        zoom: state.zoom.value,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
      }, event, surface.getBoundingClientRect());
      if (!next) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      editor.updateScene({
        appState: {
          zoom: { value: next.zoom as AppState["zoom"]["value"] },
          scrollX: next.scrollX,
          scrollY: next.scrollY,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };
    surface.addEventListener("wheel", handlePinch, { capture: true, passive: false });
    return () => surface.removeEventListener("wheel", handlePinch, true);
  }, [api, surfaceRef]);
}
