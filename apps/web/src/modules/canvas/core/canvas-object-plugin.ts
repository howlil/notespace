import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type ObjectGeometryEntry = {
  width: number;
  height: number;
  compact?: boolean;
};

export interface ObjectResizeReconcileResult {
  handled: true;
  element: OrderedExcalidrawElement;
  geometry: ObjectGeometryEntry | null;
  includeInCodeOverlay?: boolean;
  acknowledgedAutoFit?: boolean;
  normalizedManualResize?: boolean;
}

export interface CanvasObjectResizeAdapter {
  readonly kind: string;
  captureGeometry(element: OrderedExcalidrawElement): ObjectGeometryEntry | null;
  isCodeOverlay?(element: OrderedExcalidrawElement): boolean;
  reconcile(context: {
    element: OrderedExcalidrawElement;
    previousGeometry: ObjectGeometryEntry | undefined;
    expectedAutoFitHeight: number | undefined;
    isManipulating: boolean;
  }): ObjectResizeReconcileResult | null;
}

export interface CanvasObjectPlugin {
  readonly kind: "note" | "code" | "frame" | "diagram";
  matches(element: OrderedExcalidrawElement | null | undefined): boolean;
  resizeAdapter?: CanvasObjectResizeAdapter;
  decorateDirectionalSpawn?(
    source: OrderedExcalidrawElement,
    target: OrderedExcalidrawElement,
  ): OrderedExcalidrawElement;
}
