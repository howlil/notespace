import type { AppState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { DIAGRAM_DATA_KEY } from "../../features/diagram/diagram-model.ts";
import { readCanvasCodeBlock, type CanvasCodeBlockData } from "./canvas-code-block.ts";
import { codeBlockHeightChanged, shouldSwitchCodeBlockToManualHeight } from "./canvas-code-block-layout.ts";

export type CodeGeometry = { width: number; height: number };

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

export function codeOverlayElements(elements: readonly OrderedExcalidrawElement[]) {
  return elements.filter((element) => !element.isDeleted && Boolean(readCanvasCodeBlock(element)));
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

export function codeGeometryMap(elements: readonly OrderedExcalidrawElement[]) {
  const geometry = new Map<string, CodeGeometry>();
  for (const element of elements) {
    if (!element.isDeleted && readCanvasCodeBlock(element)) {
      geometry.set(element.id, { width: element.width, height: element.height });
    }
  }
  return geometry;
}

export function deriveCanvasElementState(
  elements: readonly OrderedExcalidrawElement[],
  previousGeometry: ReadonlyMap<string, CodeGeometry>,
  expectedAutoFitHeights: ReadonlyMap<string, number>,
  normalizeManualHeight: (element: OrderedExcalidrawElement, block: CanvasCodeBlockData) => OrderedExcalidrawElement,
) {
  let authoredElements: readonly OrderedExcalidrawElement[] = elements;
  let mutableElements: OrderedExcalidrawElement[] | null = null;
  let normalizedManualResize = false;
  let hasLiveElements = false;
  const acknowledgedAutoFitIds: string[] = [];
  const codeGeometry = new Map<string, CodeGeometry>();
  const codeElements: OrderedExcalidrawElement[] = [];

  elements.forEach((element, index) => {
    if (!element.isDeleted) hasLiveElements = true;
    const block = readCanvasCodeBlock(element);
    if (!block || element.isDeleted) return;

    let nextElement = element;
    const previous = previousGeometry.get(element.id);
    const expectedHeight = expectedAutoFitHeights.get(element.id);
    const autoFitAcknowledged = expectedHeight !== undefined && !codeBlockHeightChanged(expectedHeight, element.height);

    if (autoFitAcknowledged) {
      acknowledgedAutoFitIds.push(element.id);
    } else if (shouldSwitchCodeBlockToManualHeight({
      heightMode: block.heightMode,
      previousHeight: previous?.height,
      currentHeight: element.height,
      expectedAutoFitHeight: expectedHeight,
    })) {
      normalizedManualResize = true;
      nextElement = normalizeManualHeight(element, { ...block, heightMode: "manual" });
      if (!mutableElements) mutableElements = [...elements];
      mutableElements[index] = nextElement;
    }

    codeGeometry.set(nextElement.id, { width: nextElement.width, height: nextElement.height });
    codeElements.push(nextElement);
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
