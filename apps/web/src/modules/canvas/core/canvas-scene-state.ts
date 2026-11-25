import type { AppState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { DIAGRAM_DATA_KEY } from "../objects/diagram/model/diagram.ts";
import type { CanvasObjectResizeAdapter, ObjectGeometryEntry } from "./canvas-object-plugin.ts";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function canvasBackgroundColor(data: Record<string, unknown>, fallback: string) {
  const appState = objectValue(data.appState);
  return typeof appState.viewBackgroundColor === "string" ? appState.viewBackgroundColor : fallback;
}

export function authoredSceneData(data: Record<string, unknown>) {
  const appState = objectValue(data.appState);
  return {
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
      objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
    },
    files: {},
    [DIAGRAM_DATA_KEY]: data[DIAGRAM_DATA_KEY] ?? [],
  };
}

export function sceneSignature(data: Record<string, unknown>) {
  return JSON.stringify(authoredSceneData(data));
}

export function persistedAppState(state: AppState) {
  return {
    viewBackgroundColor: state.viewBackgroundColor,
    gridModeEnabled: state.gridModeEnabled,
    objectsSnapModeEnabled: state.objectsSnapModeEnabled,
  };
}

export function codeOverlayElements(
  elements: readonly OrderedExcalidrawElement[],
  adapters?: readonly CanvasObjectResizeAdapter[],
) {
  if (adapters) {
    return elements.filter((element) => !element.isDeleted && adapters.some((adapter) => adapter.isCodeOverlay?.(element)));
  }
  return elements.filter((element) => {
    if (element.isDeleted) return false;
    const custom = element.customData as Record<string, unknown> | undefined;
    return Boolean(custom && typeof custom.notespaceCodeBlock === "object" && custom.notespaceCodeBlock !== null);
  });
}

export function sameElementVersions(left: readonly OrderedExcalidrawElement[], right: readonly OrderedExcalidrawElement[]) {
  return left.length === right.length && left.every((element, index) => {
    const candidate = right[index];
    return candidate?.id === element.id
      && candidate.version === element.version
      && candidate.versionNonce === element.versionNonce
      && candidate.width === element.width
      && candidate.height === element.height;
  });
}

export function captureObjectGeometryMap(
  elements: readonly OrderedExcalidrawElement[],
  adapters: readonly CanvasObjectResizeAdapter[],
) {
  const geometry = new Map<string, ObjectGeometryEntry>();
  for (const element of elements) {
    if (element.isDeleted) continue;
    for (const adapter of adapters) {
      const entry = adapter.captureGeometry(element);
      if (entry) {
        geometry.set(element.id, entry);
        break;
      }
    }
  }
  return geometry;
}

export function deriveCanvasElementState(
  elements: readonly OrderedExcalidrawElement[],
  previousGeometry: ReadonlyMap<string, ObjectGeometryEntry>,
  expectedAutoFitHeights: ReadonlyMap<string, number>,
  adapters: readonly CanvasObjectResizeAdapter[],
  isManipulating = false,
) {
  let authoredElements: readonly OrderedExcalidrawElement[] = elements;
  let mutableElements: OrderedExcalidrawElement[] | null = null;
  let normalizedManualResize = false;
  let hasLiveElements = false;
  const acknowledgedAutoFitIds: string[] = [];
  const codeGeometry = new Map<string, ObjectGeometryEntry>();
  const codeElements: OrderedExcalidrawElement[] = [];

  elements.forEach((element, index) => {
    if (!element.isDeleted) hasLiveElements = true;
    if (element.isDeleted) return;

    for (const adapter of adapters) {
      const result = adapter.reconcile({
        element,
        previousGeometry: previousGeometry.get(element.id),
        expectedAutoFitHeight: expectedAutoFitHeights.get(element.id),
        isManipulating,
      });
      if (!result) continue;

      if (result.acknowledgedAutoFit) acknowledgedAutoFitIds.push(element.id);
      if (result.normalizedManualResize) {
        normalizedManualResize = true;
        if (!mutableElements) mutableElements = [...elements];
        mutableElements[index] = result.element;
      }
      if (result.geometry) codeGeometry.set(result.element.id, result.geometry);
      if (result.includeInCodeOverlay) codeElements.push(result.element);
      return;
    }
  });

  if (mutableElements) authoredElements = mutableElements;

  return {
    authoredElements,
    codeElements,
    codeGeometry,
    acknowledgedAutoFitIds,
    normalizedManualResize,
    hasLiveElements,
  };
}
