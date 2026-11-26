import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/element/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, type RefObject } from "react";
import { notePlacement } from "../../../../entities/note";
import { withCanvasWorkspaceShortcut } from "../../../../entities/workspace-shortcut";
import { codeOverlayElements } from "../../core/canvas-scene-state";
import { isFrameElement } from "./canvas-frame-style";
import {
  computeFitSectionBounds,
  computeSectionBoundsAroundElements,
  computeTidySectionLayout,
  findDeepestContainingFrame,
} from "./section-model";

type UseCanvasSectionsParams = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef?: RefObject<HTMLDivElement | null>;
  dark?: boolean;
  setSceneElements: (elements: readonly OrderedExcalidrawElement[]) => void;
  setOverlayElements?: (elements: readonly OrderedExcalidrawElement[]) => void;
  setHasElements?: (has: boolean) => void;
  setSelectedElementCount?: (count: number) => void;
  setSelectedElementId?: (id: string | null) => void;
  emitSnapshot?: (elements: readonly OrderedExcalidrawElement[], state: AppState) => void;
};

export function useCanvasSections({
  apiRef,
  surfaceRef,
  dark = false,
  setSceneElements,
  setOverlayElements,
  setHasElements,
  setSelectedElementCount,
  setSelectedElementId,
  emitSnapshot,
}: UseCanvasSectionsParams) {
  const commitScene = useCallback((
    api: ExcalidrawImperativeAPI,
    elements: readonly OrderedExcalidrawElement[],
    selectedElementIds?: Record<string, true>,
  ) => {
    api.updateScene({
      elements,
      ...(selectedElementIds ? { appState: { selectedElementIds } } : {}),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setSceneElements(elements);
    setOverlayElements?.(codeOverlayElements(elements));
    setHasElements?.(elements.some((element) => !element.isDeleted));
    if (selectedElementIds) {
      const ids = Object.keys(selectedElementIds);
      setSelectedElementCount?.(ids.length);
      setSelectedElementId?.(ids.length === 1 ? ids[0] : null);
    }
    emitSnapshot?.(elements, api.getAppState());
  }, [emitSnapshot, setHasElements, setOverlayElements, setSceneElements, setSelectedElementCount, setSelectedElementId]);

  const createSectionAroundSelection = useCallback((title?: string): string | null => {
    const api = apiRef.current;
    if (!api) return null;
    const state = api.getAppState();
    const selectedIds = new Set(
      Object.entries(state.selectedElementIds)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    );
    const allElements = api.getSceneElementsIncludingDeleted();
    const selectedElements = allElements.filter(
      (element) => !element.isDeleted && selectedIds.has(element.id) && !isFrameElement(element),
    );
    const bounds = computeSectionBoundsAroundElements(selectedElements);
    if (!bounds) return null;

    const skeleton: ExcalidrawElementSkeleton = {
      type: "frame",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      name: title?.trim() || "Section",
    };
    const converted = convertToExcalidrawElements([skeleton]) as OrderedExcalidrawElement[];
    const frame = converted[0];
    if (!frame) return null;

    const updatedElements = allElements.map((element) => (
      selectedIds.has(element.id) && !element.isDeleted && !isFrameElement(element)
        ? newElementWith(element, { frameId: frame.id })
        : element
    )) as OrderedExcalidrawElement[];

    commitScene(api, [...updatedElements, frame], { [frame.id]: true });
    return frame.id;
  }, [apiRef, commitScene]);

  const fitSectionToContent = useCallback((frameId: string): boolean => {
    const api = apiRef.current;
    if (!api) return false;
    const allElements = api.getSceneElementsIncludingDeleted();
    const frame = allElements.find((element) => element.id === frameId && !element.isDeleted && isFrameElement(element));
    if (!frame) return false;

    const members = allElements.filter((element) => !element.isDeleted && element.frameId === frameId);
    const nextBounds = computeFitSectionBounds(frame, members);
    const nextElements = allElements.map((element) => (
      element.id === frameId ? newElementWith(element, nextBounds) : element
    )) as OrderedExcalidrawElement[];

    commitScene(api, nextElements);
    return true;
  }, [apiRef, commitScene]);

  const tidySection = useCallback((frameId: string): boolean => {
    const api = apiRef.current;
    if (!api) return false;
    const allElements = api.getSceneElementsIncludingDeleted();
    const frame = allElements.find((element) => element.id === frameId && !element.isDeleted && isFrameElement(element));
    if (!frame) return false;

    const members = allElements.filter((element) => !element.isDeleted && element.frameId === frameId);
    const placements = computeTidySectionLayout(frame, members);
    if (placements.length === 0) return false;

    const placementById = new Map(placements.map((item) => [item.id, item]));
    const nextElements = allElements.map((element) => {
      const placement = placementById.get(element.id);
      return placement ? newElementWith(element, { x: placement.x, y: placement.y }) : element;
    }) as OrderedExcalidrawElement[];

    commitScene(api, nextElements);
    return true;
  }, [apiRef, commitScene]);

  const ungroupSection = useCallback((frameId: string): boolean => {
    const api = apiRef.current;
    if (!api) return false;
    const allElements = api.getSceneElementsIncludingDeleted();
    const frame = allElements.find((element) => element.id === frameId && !element.isDeleted && isFrameElement(element));
    if (!frame) return false;

    const nextElements = allElements.map((element) => {
      if (element.id === frameId) {
        return newElementWith(element, { isDeleted: true });
      }
      if (element.frameId === frameId) {
        return newElementWith(element, { frameId: null });
      }
      return element;
    }) as OrderedExcalidrawElement[];

    commitScene(api, nextElements, {});
    return true;
  }, [apiRef, commitScene]);

  const syncElementFrameMembership = useCallback((movedElementIds: readonly string[]): boolean => {
    if (movedElementIds.length === 0) return false;
    const api = apiRef.current;
    if (!api) return false;

    const allElements = api.getSceneElementsIncludingDeleted();
    const liveFrames = allElements.filter((element) => !element.isDeleted && isFrameElement(element));
    const movedSet = new Set(movedElementIds);
    let changed = false;

    const nextElements = allElements.map((element) => {
      if (!movedSet.has(element.id) || element.isDeleted || isFrameElement(element)) {
        return element;
      }
      const containingFrame = findDeepestContainingFrame(element, liveFrames);
      const nextFrameId = containingFrame ? containingFrame.id : null;
      if ((element.frameId ?? null) === nextFrameId) {
        return element;
      }
      changed = true;
      return newElementWith(element, { frameId: nextFrameId });
    }) as OrderedExcalidrawElement[];

    if (!changed) return false;
    commitScene(api, nextElements);
    return true;
  }, [apiRef, commitScene]);

  const insertWorkspaceShortcut = useCallback((targetWorkspaceId: string): string | null => {
    if (!targetWorkspaceId.trim()) return null;
    const api = apiRef.current;
    if (!api) return null;

    const state = api.getAppState();
    const allElements = api.getSceneElementsIncludingDeleted();
    const width = 240;
    const height = 112;
    const placement = notePlacement({
      viewportWidth: surfaceRef?.current?.clientWidth || state.width || 960,
      viewportHeight: surfaceRef?.current?.clientHeight || state.height || 640,
      zoom: state.zoom.value || 1,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      width,
      height,
      occupied: allElements,
    });

    const skeleton: ExcalidrawElementSkeleton = {
      type: "rectangle",
      x: placement.x,
      y: placement.y,
      width,
      height,
      strokeColor: dark ? "#68707a" : "#b8bec7",
      backgroundColor: dark ? "#25282d" : "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3 },
      opacity: 0,
    };
    const converted = convertToExcalidrawElements([skeleton]) as OrderedExcalidrawElement[];
    const provisional = converted[0];
    if (!provisional) return null;

    const shortcutElement = newElementWith(provisional, {
      customData: withCanvasWorkspaceShortcut(provisional.customData, { targetWorkspaceId }),
    });
    commitScene(api, [...allElements, shortcutElement], { [shortcutElement.id]: true });
    return shortcutElement.id;
  }, [apiRef, commitScene, dark, surfaceRef]);

  return {
    createSectionAroundSelection,
    fitSectionToContent,
    tidySection,
    ungroupSection,
    syncElementFrameMembership,
    insertWorkspaceShortcut,
  };
}
