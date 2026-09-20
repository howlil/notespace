import { CaptureUpdateAction, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
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
  isNativeFlowchartShapeType,
  keyFromDirection,
  type DirectionalSpawnDirection,
} from "./CanvasDirectionalSpawn";
import type { CanvasFlowchartAnchor } from "./CanvasFlowchartHandles";

type FlowchartAppState = AppState & { editingLinearElement?: unknown };

export function useCanvasFlowchart({
  apiRef,
  surfaceRef,
  decorateTarget,
}: {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  decorateTarget?: (
    source: OrderedExcalidrawElement,
    target: OrderedExcalidrawElement,
  ) => OrderedExcalidrawElement;
}) {
  const [anchor, setAnchor] = useState<CanvasFlowchartAnchor | null>(null);
  const [previewDirection, setPreviewDirection] =
    useState<DirectionalSpawnDirection | null>(null);
  const previewRef = useRef<DirectionalSpawnDirection | null>(null);

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
    setPreviewDirection(null);
  }, [apiRef]);

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
      const beforeIds = new Set(api.getSceneElementsIncludingDeleted().map((element) => element.id));

      if (previewRef.current && previewRef.current !== direction) {
        api.app.flowchart.handleKeyEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: false,
            cancelable: true,
          }),
        );
      }

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
          decorated = true;
          return decorateTarget(source, element);
        });
        if (decorated) {
          api.updateScene({
            elements,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }

      previewRef.current = direction;
      setPreviewDirection(direction);
      return true;
    },
    [apiRef, decorateTarget],
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
      previewRef.current = null;
      setPreviewDirection(null);
      requestAnimationFrame(focusEditor);
    },
    [apiRef, beginPreview, focusEditor],
  );

  const syncSelection = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      state: AppState,
      selectedIds: readonly string[],
      structuredNodeSelected: boolean,
    ) => {
      const selectedElement =
        selectedIds.length === 1
          ? elements.find(
              (element) =>
                element.id === selectedIds[0] && !element.isDeleted,
            ) ?? null
          : null;

      if (
        selectedElement &&
        !structuredNodeSelected &&
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
        setAnchor({
          id: selectedElement.id,
          left: Math.min(topLeft.x, bottomRight.x),
          top: Math.min(topLeft.y, bottomRight.y),
          right: Math.max(topLeft.x, bottomRight.x),
          bottom: Math.max(topLeft.y, bottomRight.y),
        });
        return;
      }

      setAnchor(null);
      if (previewRef.current) {
        previewRef.current = null;
        setPreviewDirection(null);
      }
    },
    [],
  );

  return {
    anchor,
    previewDirection,
    beginPreview,
    cancelPreview,
    commitPreview,
    syncSelection,
    focusEditor,
  };
}
