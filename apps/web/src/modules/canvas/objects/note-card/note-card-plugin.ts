import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  readCanvasNoteReference,
  withCanvasNoteReference,
  withoutCanvasNoteReference,
  type CanvasNoteReference,
} from "../../../../entities/note.ts";
import type { CanvasObjectPlugin, CanvasObjectResizeAdapter } from "../../core/canvas-object-plugin.ts";
import { noteHeightChanged, shouldSwitchNoteToFixedHeight } from "./model/note-card-layout.ts";

export function createNoteCardResizeAdapter(
  normalizeManualNoteHeight?: (element: OrderedExcalidrawElement, reference: CanvasNoteReference) => OrderedExcalidrawElement,
): CanvasObjectResizeAdapter {
  return {
    kind: "note",
    captureGeometry(element) {
      const noteReference = readCanvasNoteReference(element);
      if (!noteReference) return null;
      return { width: element.width, height: element.height, compact: noteReference.compact === true };
    },
    reconcile({ element, previousGeometry, expectedAutoFitHeight, isManipulating }) {
      const noteReference = readCanvasNoteReference(element);
      if (!noteReference) return null;

      const isCompact = noteReference.compact === true;
      if (expectedAutoFitHeight !== undefined && !noteHeightChanged(expectedAutoFitHeight, element.height)) {
        return {
          handled: true,
          element,
          geometry: { width: element.width, height: element.height, compact: isCompact },
          acknowledgedAutoFit: true,
        };
      }
      if (isManipulating) {
        return {
          handled: true,
          element,
          geometry: previousGeometry ?? null,
        };
      }
      // Folding/unfolding (including Undo/Redo of fold) changes element height without locking fixed mode.
      if (isCompact || (previousGeometry?.compact !== undefined && previousGeometry.compact !== isCompact)) {
        return {
          handled: true,
          element,
          geometry: { width: element.width, height: element.height, compact: isCompact },
        };
      }
      const manualResize = shouldSwitchNoteToFixedHeight({
        heightMode: noteReference.heightMode,
        previousHeight: previousGeometry?.height,
        currentHeight: element.height,
        expectedAutoFitHeight,
      });
      if (manualResize && normalizeManualNoteHeight) {
        const nextElement = normalizeManualNoteHeight(element, { ...noteReference, heightMode: "fixed" });
        return {
          handled: true,
          element: nextElement,
          geometry: { width: nextElement.width, height: nextElement.height, compact: isCompact },
          normalizedManualResize: true,
        };
      }
      return {
        handled: true,
        element,
        geometry: { width: element.width, height: element.height, compact: isCompact },
      };
    },
  };
}

export function createNoteCardPlugin(
  updateElement: (element: OrderedExcalidrawElement, patch: { customData: Record<string, unknown> | undefined }) => OrderedExcalidrawElement,
): CanvasObjectPlugin {
  return {
    kind: "note",
    matches: (element) => Boolean(readCanvasNoteReference(element)),
    resizeAdapter: createNoteCardResizeAdapter((element, reference) => updateElement(element, {
      customData: withCanvasNoteReference(element.customData, reference),
    })),
    decorateDirectionalSpawn(source, target) {
      if (!readCanvasNoteReference(source)) return target;
      // A connected Note gets its own identity from the Note store, never a copy of the source reference.
      if (!readCanvasNoteReference(target)) return target;
      return updateElement(target, {
        customData: withoutCanvasNoteReference(target.customData),
      });
    },
  };
}
