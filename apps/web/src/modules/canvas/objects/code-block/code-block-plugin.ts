import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CanvasObjectPlugin, CanvasObjectResizeAdapter } from "../../core/canvas-object-plugin.ts";
import {
  defaultCanvasCodeBlock,
  readCanvasCodeBlock,
  withCanvasCodeBlock,
  type CanvasCodeBlockData,
} from "./model/canvas-code-block.ts";
import {
  clampCodeBlockHeight,
  codeBlockHeightChanged,
  shouldSwitchCodeBlockToManualHeight,
} from "./model/canvas-code-block-layout.ts";

export function createCodeBlockResizeAdapter(
  normalizeManualHeight: (element: OrderedExcalidrawElement, block: CanvasCodeBlockData) => OrderedExcalidrawElement,
): CanvasObjectResizeAdapter {
  return {
    kind: "code",
    captureGeometry(element) {
      return readCanvasCodeBlock(element) ? { width: element.width, height: element.height } : null;
    },
    isCodeOverlay(element) {
      return Boolean(readCanvasCodeBlock(element));
    },
    reconcile({ element, previousGeometry, expectedAutoFitHeight }) {
      const block = readCanvasCodeBlock(element);
      if (!block) return null;

      let nextElement = element;
      const clampedHeight = clampCodeBlockHeight(element.height);
      const heightWasClamped = clampedHeight !== element.height;
      const clampedElement = heightWasClamped ? { ...element, height: clampedHeight } : element;
      const autoFitAcknowledged = expectedAutoFitHeight !== undefined
        && !codeBlockHeightChanged(expectedAutoFitHeight, element.height);

      if (autoFitAcknowledged) {
        return {
          handled: true,
          element: nextElement,
          geometry: { width: nextElement.width, height: nextElement.height },
          includeInCodeOverlay: true,
          acknowledgedAutoFit: true,
        };
      }

      const manualResize = shouldSwitchCodeBlockToManualHeight({
        heightMode: block.heightMode,
        previousHeight: previousGeometry?.height,
        currentHeight: element.height,
        expectedAutoFitHeight,
      });

      if (!heightWasClamped && !manualResize) {
        return {
          handled: true,
          element: nextElement,
          geometry: { width: nextElement.width, height: nextElement.height },
          includeInCodeOverlay: true,
        };
      }

      nextElement = normalizeManualHeight(clampedElement, {
        ...block,
        ...(manualResize ? { heightMode: "manual" } : {}),
      });
      return {
        handled: true,
        element: nextElement,
        geometry: { width: nextElement.width, height: nextElement.height },
        includeInCodeOverlay: true,
        normalizedManualResize: true,
      };
    },
  };
}

export function createCodeBlockPlugin(
  updateElement: (element: OrderedExcalidrawElement, patch: { customData: Record<string, unknown> }) => OrderedExcalidrawElement,
): CanvasObjectPlugin {
  return {
    kind: "code",
    matches: (element) => Boolean(readCanvasCodeBlock(element)),
    resizeAdapter: createCodeBlockResizeAdapter((element, block) => updateElement(element, {
      customData: withCanvasCodeBlock(element.customData, block),
    })),
    decorateDirectionalSpawn(source, target) {
      const sourceBlock = readCanvasCodeBlock(source);
      if (!sourceBlock) return target;
      const nextBlock = {
        ...defaultCanvasCodeBlock(),
        theme: sourceBlock.theme,
        lineNumbers: sourceBlock.lineNumbers,
      };
      return updateElement(target, {
        customData: withCanvasCodeBlock(target.customData, nextBlock),
      });
    },
  };
}
