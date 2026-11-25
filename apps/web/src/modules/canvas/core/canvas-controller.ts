import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createStore, type ExternalStore } from "../../../shared/lib/store.ts";
import type { CanvasContextualAnchor } from "../chrome/CanvasBottomChrome";
import type { DiagramNodeQuickPickerTarget } from "../objects/diagram/palette/DiagramNodeQuickPicker";

export type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };

/**
 * Discriminated union state machine for mutually exclusive Canvas overlay/editing modes.
 * Makes impossible states (e.g. context menu + tool settings + note editing open simultaneously)
 * unrepresentable by construction.
 */
export type CanvasOverlayMode =
  | { kind: "none" }
  | { kind: "tool-popover"; panel: "diagram" }
  | { kind: "tool-settings" }
  | { kind: "view-menu" }
  | { kind: "selection-panel" }
  | { kind: "context-menu"; point: { x: number; y: number } }
  | { kind: "editing-code"; elementId: string }
  | { kind: "editing-note"; elementId: string }
  | { kind: "expanded-note"; elementId: string }
  | { kind: "note-info"; noteId: string }
  | { kind: "note-picker" }
  | { kind: "diagram-quick-picker"; target: DiagramNodeQuickPickerTarget };

export interface CanvasSelectionSlice {
  selectedElementId: string | null;
  selectedElementCount: number;
  selectionKey: string;
  selectionStyleKey: string;
  selectionAnchor: CanvasContextualAnchor | null;
  isManipulating: boolean;
  isMarqueeSelecting: boolean;
}

export interface CanvasSceneSlice {
  elements: readonly OrderedExcalidrawElement[];
  overlayElements: readonly OrderedExcalidrawElement[];
  hasElements: boolean;
  activeTool: AppState["activeTool"]["type"];
  backgroundColor: string;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  viewModeEnabled: boolean;
  nativeContextMenuOpen: boolean;
}

export interface CanvasController {
  readonly viewport: ExternalStore<CanvasViewport>;
  readonly selection: ExternalStore<CanvasSelectionSlice>;
  readonly scene: ExternalStore<CanvasSceneSlice>;
  readonly overlay: ExternalStore<CanvasOverlayMode>;
  attachApi: (api: ExcalidrawImperativeAPI | null) => void;
  getApi: () => ExcalidrawImperativeAPI | null;
  setViewport: (next: CanvasViewport) => void;
  setOverlay: (next: CanvasOverlayMode) => void;
  closeOverlays: () => void;
  toggleToolPopover: (panel: "diagram") => void;
  openContextMenu: (point: { x: number; y: number }) => void;
  setSelection: (patch: Partial<CanvasSelectionSlice>) => void;
  setScene: (patch: Partial<CanvasSceneSlice>) => void;
}

function sameAnchor(a: CanvasContextualAnchor | null, b: CanvasContextualAnchor | null): boolean {
  return a?.left === b?.left && a?.top === b?.top && a?.right === b?.right && a?.bottom === b?.bottom;
}

export function isOverlayBlockingCanvas(
  mode: CanvasOverlayMode,
  options: {
    contextualInteractionActive: boolean;
    nativeContextMenuOpen: boolean;
    viewModeEnabled: boolean;
  },
): boolean {
  if (options.contextualInteractionActive || options.nativeContextMenuOpen || options.viewModeEnabled) {
    return true;
  }
  return mode.kind !== "none" && mode.kind !== "tool-settings" && mode.kind !== "view-menu" && mode.kind !== "selection-panel";
}

export function createCanvasController(initial: {
  elements: readonly OrderedExcalidrawElement[];
  overlayElements: readonly OrderedExcalidrawElement[];
  backgroundColor: string;
}): CanvasController {
  let api: ExcalidrawImperativeAPI | null = null;

  const viewport = createStore<CanvasViewport>({ zoom: 1, scrollX: 0, scrollY: 0 });
  const selection = createStore<CanvasSelectionSlice>({
    selectedElementId: null,
    selectedElementCount: 0,
    selectionKey: "",
    selectionStyleKey: "",
    selectionAnchor: null,
    isManipulating: false,
    isMarqueeSelecting: false,
  });
  const scene = createStore<CanvasSceneSlice>({
    elements: initial.elements,
    overlayElements: initial.overlayElements,
    hasElements: initial.elements.some((element) => !element.isDeleted),
    activeTool: "selection",
    backgroundColor: initial.backgroundColor,
    gridModeEnabled: false,
    objectsSnapModeEnabled: false,
    viewModeEnabled: false,
    nativeContextMenuOpen: false,
  });
  const overlay = createStore<CanvasOverlayMode>({ kind: "none" });

  return {
    viewport,
    selection,
    scene,
    overlay,
    attachApi(nextApi) {
      api = nextApi;
    },
    getApi() {
      return api;
    },
    setViewport(next) {
      viewport.setState((current) => (
        current.zoom === next.zoom
        && current.scrollX === next.scrollX
        && current.scrollY === next.scrollY
          ? current
          : next
      ));
    },
    setOverlay(next) {
      overlay.setState((current) => (
        current.kind === "none" && next.kind === "none" ? current : next
      ));
    },
    closeOverlays() {
      overlay.setState((current) => (current.kind === "none" ? current : { kind: "none" }));
    },
    toggleToolPopover(panel) {
      overlay.setState((current) => (
        current.kind === "tool-popover" && current.panel === panel
          ? { kind: "none" }
          : { kind: "tool-popover", panel }
      ));
    },
    openContextMenu(point) {
      overlay.setState({ kind: "context-menu", point });
    },
    setSelection(patch) {
      selection.setState((current) => {
        const nextAnchor = patch.selectionAnchor !== undefined
          ? (sameAnchor(current.selectionAnchor, patch.selectionAnchor) ? current.selectionAnchor : patch.selectionAnchor)
          : current.selectionAnchor;
        const next: CanvasSelectionSlice = {
          ...current,
          ...patch,
          selectionAnchor: nextAnchor,
        };
        if (
          next.selectedElementId === current.selectedElementId
          && next.selectedElementCount === current.selectedElementCount
          && next.selectionKey === current.selectionKey
          && next.selectionStyleKey === current.selectionStyleKey
          && next.selectionAnchor === current.selectionAnchor
          && next.isManipulating === current.isManipulating
          && next.isMarqueeSelecting === current.isMarqueeSelecting
        ) {
          return current;
        }
        return next;
      });
    },
    setScene(patch) {
      scene.setState((current) => {
        const next: CanvasSceneSlice = { ...current, ...patch };
        if (
          next.elements === current.elements
          && next.overlayElements === current.overlayElements
          && next.hasElements === current.hasElements
          && next.activeTool === current.activeTool
          && next.backgroundColor === current.backgroundColor
          && next.gridModeEnabled === current.gridModeEnabled
          && next.objectsSnapModeEnabled === current.objectsSnapModeEnabled
          && next.viewModeEnabled === current.viewModeEnabled
          && next.nativeContextMenuOpen === current.nativeContextMenuOpen
        ) {
          return current;
        }
        return next;
      });
    },
  };
}
