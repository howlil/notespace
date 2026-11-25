import { useEffect, type RefObject } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  canvasPinchViewport,
  isCanvasPinchTarget,
  pinchBaseViewport,
  type PendingPinchViewport,
} from "./canvas-pinch-zoom";

export function useCanvasPinch(surfaceRef: RefObject<HTMLDivElement | null>, api: RefObject<ExcalidrawImperativeAPI | null>) {
  useEffect(() => {
    // Excalidraw's wheel handler accepts only select DOM targets. The authoring
    // overlays can therefore swallow a trackpad pinch, especially in WebView2.
    // Capture modified wheel before the Excalidraw handler; normal two-finger
    // scrolling still reaches Excalidraw as pan, with no double zoom.
    const surface = surfaceRef.current;
    if (!surface) return;
    let pending: PendingPinchViewport | null = null;
    const handlePinch = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const rawTarget = event.target;
      const target = rawTarget instanceof Element
        ? rawTarget
        : rawTarget instanceof Node
          ? rawTarget.parentElement
          : null;
      if (!target) return;
      if (!isCanvasPinchTarget(target)) return;

      const editor = api.current;
      if (!editor) return;
      const state = editor.getAppState();
      const committed = {
        zoom: state.zoom.value,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
      };
      const base = pinchBaseViewport(committed, pending, event.timeStamp);
      const next = canvasPinchViewport(base, event, surface.getBoundingClientRect());
      if (!next) return;
      pending = { committed, next, timeStamp: event.timeStamp };

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
