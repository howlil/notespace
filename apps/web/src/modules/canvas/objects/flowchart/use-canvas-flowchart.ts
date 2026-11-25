import { CaptureUpdateAction, newElementWith, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  useCallback,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  hoveredFlowchartDirection,
  isNativeFlowchartShapeType,
  keyFromDirection,
  type DirectionalSpawnDirection,
} from "./CanvasDirectionalSpawn";
import type { CanvasFlowchartAnchor } from "./CanvasFlowchartHandles";

type FlowchartAppState = AppState & { editingLinearElement?: unknown };

type HoveredFlowchartHandle = { elementId: string; direction: DirectionalSpawnDirection };

type FlowchartSemanticPreview = {
  sourceId: string;
  beforeIds: Set<string>;
  targetId?: string;
};

export function useCanvasFlowchart({
  apiRef,
  surfaceRef,
  decorateTarget,
  onSpawned,
}: {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  decorateTarget?: (
    source: OrderedExcalidrawElement,
    target: OrderedExcalidrawElement,
  ) => OrderedExcalidrawElement;
  /** Fires once per committed spawn with the source and the shape it created. */
  onSpawned?: (
    source: OrderedExcalidrawElement,
    target: OrderedExcalidrawElement,
  ) => void;
}) {
  const [anchor, setAnchor] = useState<CanvasFlowchartAnchor | null>(null);
  const anchorRef = useRef<CanvasFlowchartAnchor | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HoveredFlowchartHandle | null>(null);
  const [touchInput, setTouchInput] = useState(false);
  const [previewDirection, setPreviewDirection] =
    useState<DirectionalSpawnDirection | null>(null);
  const previewRef = useRef<DirectionalSpawnDirection | null>(null);
  const semanticPreviewRef = useRef<FlowchartSemanticPreview | null>(null);

  const focusEditor = useCallback(() => {
    const editor = surfaceRef.current?.querySelector(".excalidraw");
    if (editor instanceof HTMLElement) editor.focus({ preventScroll: true });
  }, [surfaceRef]);

  const cancelPreview = useCallback(() => {
    if (!previewRef.current) return;
    const api = apiRef.current;
    if (api) {
      api.app.flowchart.handleKeyEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: false,
          cancelable: true,
        }),
      );
    }
    previewRef.current = null;
    semanticPreviewRef.current = null;
    setPreviewDirection(null);
  }, [apiRef]);

  const trackPointer = useCallback((clientX: number, clientY: number, pointerType: string) => {
    if (pointerType === "touch") {
      setTouchInput(true);
      setHoveredHandle(null);
      return;
    }
    if (pointerType !== "mouse" && pointerType !== "pen") return;
    setTouchInput(false);
    const selected = anchorRef.current;
    const previous = selected && hoveredHandle?.elementId === selected.id ? hoveredHandle.direction : null;
    const direction = selected ? hoveredFlowchartDirection(selected, clientX, clientY, previous) : null;
    if (previewRef.current && previewRef.current !== direction) cancelPreview();
    setHoveredHandle((current) => {
      if (!selected || !direction) return current === null ? current : null;
      if (current?.elementId === selected.id && current.direction === direction) return current;
      return { elementId: selected.id, direction };
    });
  }, [cancelPreview, hoveredHandle]);

  const clearHover = useCallback(() => {
    setHoveredHandle(null);
    cancelPreview();
  }, [cancelPreview]);

  const beginPreview = useCallback(
    (direction: DirectionalSpawnDirection) => {
      const api = apiRef.current;
      if (!api) return false;

      const state = api.getAppState() as FlowchartAppState;
      if (
        state.editingTextElement ||
        state.editingLinearElement ||
        state.openDialog
      ) {
        return false;
      }

      const selectedIds = Object.entries(state.selectedElementIds)
        .filter(([, selected]) => selected)
        .map(([id]) => id);
      if (selectedIds.length !== 1) return false;

      const source = api
        .getSceneElements()
        .find(
          (element) =>
            element.id === selectedIds[0] && !element.isDeleted,
        );
      if (!source || !isNativeFlowchartShapeType(source.type)) return false;
      if (previewRef.current === direction && semanticPreviewRef.current?.sourceId === source.id) return true;
      if (previewRef.current) cancelPreview();
      const beforeIds = new Set(api.getSceneElementsIncludingDeleted().map((element) => element.id));

      const handled = api.app.flowchart.handleKeyEvent(
        new KeyboardEvent("keydown", {
          key: keyFromDirection(direction),
          ctrlKey: true,
          metaKey: true,
          bubbles: false,
          cancelable: true,
        }),
      );
      if (!handled || !api.app.flowchart.isCreatingChart) return false;

      // Hidden carrier rectangles (such as Note hosts with opacity: 0) cause Excalidraw's
      // FlowChartCreator to clone pending nodes and binding arrows at opacity: 0; restore preview visibility.
      const pendingNodes = api.app.flowchart.pendingNodes;
      if (source.opacity === 0 && pendingNodes) {
        let adjusted = false;
        pendingNodes.forEach((node, index) => {
          if (node.opacity !== 0) return;
          pendingNodes[index] = newElementWith(node, { opacity: 100 });
          adjusted = true;
        });
        if (adjusted) api.app.triggerRender(true);
      }

      const semanticPreview: FlowchartSemanticPreview = {
        sourceId: source.id,
        beforeIds,
      };
      if (decorateTarget) {
        let decorated = false;
        const elements = api.getSceneElementsIncludingDeleted().map((element) => {
          if (
            decorated
            || beforeIds.has(element.id)
            || element.isDeleted
            || !isNativeFlowchartShapeType(element.type)
          ) {
            return element;
          }
          const next = decorateTarget(source, element);
          if (next === element) return element;
          decorated = true;
          semanticPreview.targetId = element.id;
          return next;
        });
        if (decorated) {
          api.updateScene({
            elements,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }
      semanticPreviewRef.current = semanticPreview;

      previewRef.current = direction;
      setPreviewDirection(direction);
      return true;
    },
    [apiRef, cancelPreview, decorateTarget],
  );

  const commitPreview = useCallback(
    (direction?: DirectionalSpawnDirection) => {
      if (
        !previewRef.current &&
        direction &&
        !beginPreview(direction)
      ) {
        return;
      }

      const api = apiRef.current;
      const activeDirection = previewRef.current;
      if (!api || !activeDirection) return;

      const semanticPreview = semanticPreviewRef.current;
      api.app.flowchart.handleKeyEvent(
        new KeyboardEvent("keyup", {
          key: keyFromDirection(activeDirection),
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          bubbles: false,
          cancelable: true,
        }),
      );

      const decorateCommittedTarget = () => {
        if (!semanticPreview) return false;
        const current = api.getSceneElementsIncludingDeleted();
        const source = current.find(
          (element) => element.id === semanticPreview.sourceId && !element.isDeleted,
        );
        if (!source) return false;

        const rememberedTargetId =
          semanticPreview.targetId
          && current.some(
            (element) =>
              element.id === semanticPreview.targetId
              && !element.isDeleted
              && isNativeFlowchartShapeType(element.type),
          )
            ? semanticPreview.targetId
            : undefined;

        let updated = false;
        let decorated = false;
        const elements = current.map((element) => {
          if (
            !semanticPreview.beforeIds.has(element.id)
            && !element.isDeleted
            && element.type === "arrow"
            && source.opacity === 0
            && element.opacity === 0
          ) {
            updated = true;
            return newElementWith(element, { opacity: 100 });
          }
          if (!decorateTarget) return element;
          const isTarget = rememberedTargetId
            ? element.id === rememberedTargetId
            : !semanticPreview.beforeIds.has(element.id)
              && !element.isDeleted
              && isNativeFlowchartShapeType(element.type);
          if (!isTarget || decorated || element.isDeleted) return element;
          const next = decorateTarget(source, element);
          if (next === element) return element;
          decorated = true;
          updated = true;
          semanticPreview.targetId = element.id;
          return next;
        });
        if (!updated) return false;
        api.updateScene({
          elements,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        return true;
      };

      const decoratedSynchronously = decorateCommittedTarget();
      let spawnReported = false;
      const reportSpawned = () => {
        if (spawnReported || !onSpawned || !semanticPreview) return;
        const current = api.getSceneElementsIncludingDeleted();
        const source = current.find(
          (element) => element.id === semanticPreview.sourceId && !element.isDeleted,
        );
        const target = current.find(
          (element) =>
            !semanticPreview.beforeIds.has(element.id)
            && !element.isDeleted
            && isNativeFlowchartShapeType(element.type),
        );
        if (!source || !target) return;
        spawnReported = true;
        onSpawned(source, target);
      };
      reportSpawned();
      previewRef.current = null;
      semanticPreviewRef.current = null;
      setPreviewDirection(null);
      requestAnimationFrame(() => {
        if (!decoratedSynchronously) decorateCommittedTarget();
        reportSpawned();
        focusEditor();
      });
    },
    [apiRef, beginPreview, decorateTarget, focusEditor, onSpawned],
  );

  const syncSelection = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      state: AppState,
      selectedIds: readonly string[],
      structuredNodeSelectedId: string | null,
    ) => {
      if (
        structuredNodeSelectedId &&
        state.activeTool.type === "selection"
      ) {
        const selectedSet = new Set(selectedIds);
        const nodeElements = elements.filter(
          (element) => selectedSet.has(element.id) && !element.isDeleted,
        );
        if (nodeElements.length > 0) {
          const minX = Math.min(...nodeElements.map((element) => element.x));
          const minY = Math.min(...nodeElements.map((element) => element.y));
          const maxX = Math.max(...nodeElements.map((element) => element.x + element.width));
          const maxY = Math.max(...nodeElements.map((element) => element.y + element.height));
          const topLeft = sceneCoordsToViewportCoords({ sceneX: minX, sceneY: minY }, state);
          const bottomRight = sceneCoordsToViewportCoords({ sceneX: maxX, sceneY: maxY }, state);
          const nextAnchor = {
            id: structuredNodeSelectedId,
            left: Math.min(topLeft.x, bottomRight.x),
            top: Math.min(topLeft.y, bottomRight.y),
            right: Math.max(topLeft.x, bottomRight.x),
            bottom: Math.max(topLeft.y, bottomRight.y),
          };
          if (anchorRef.current?.id !== nextAnchor.id) setHoveredHandle(null);
          cancelPreview();
          anchorRef.current = nextAnchor;
          setAnchor(nextAnchor);
          return;
        }
      }

      const selectedElement =
        selectedIds.length === 1
          ? elements.find(
              (element) =>
                element.id === selectedIds[0] && !element.isDeleted,
            ) ?? null
          : null;

      if (
        selectedElement &&
        !structuredNodeSelectedId &&
        state.activeTool.type === "selection" &&
        isNativeFlowchartShapeType(selectedElement.type)
      ) {
        const topLeft = sceneCoordsToViewportCoords(
          {
            sceneX: selectedElement.x,
            sceneY: selectedElement.y,
          },
          state,
        );
        const bottomRight = sceneCoordsToViewportCoords(
          {
            sceneX: selectedElement.x + selectedElement.width,
            sceneY: selectedElement.y + selectedElement.height,
          },
          state,
        );
        const nextAnchor = {
          id: selectedElement.id,
          left: Math.min(topLeft.x, bottomRight.x),
          top: Math.min(topLeft.y, bottomRight.y),
          right: Math.max(topLeft.x, bottomRight.x),
          bottom: Math.max(topLeft.y, bottomRight.y),
        };
        if (anchorRef.current?.id !== nextAnchor.id) setHoveredHandle(null);
        const activePreview = semanticPreviewRef.current;
        if (previewRef.current && activePreview && selectedElement.id !== activePreview.sourceId && selectedElement.id !== activePreview.targetId) cancelPreview();
        anchorRef.current = nextAnchor;
        setAnchor(nextAnchor);
        return;
      }

      anchorRef.current = null;
      setAnchor(null);
      setHoveredHandle(null);
      cancelPreview();
    },
    [cancelPreview],
  );

  const activeDirection = anchor
    ? (hoveredHandle?.elementId === anchor.id ? hoveredHandle.direction : touchInput ? "right" : null)
    : null;

  return {
    anchor,
    activeDirection,
    previewDirection,
    trackPointer,
    clearHover,
    beginPreview,
    cancelPreview,
    commitPreview,
    syncSelection,
    focusEditor,
  };
}
