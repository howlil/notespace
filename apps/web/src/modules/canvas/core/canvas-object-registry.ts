import { newElementWith } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CanvasObjectPlugin, CanvasObjectResizeAdapter } from "./canvas-object-plugin";
import { createCodeBlockPlugin } from "../objects/code-block/code-block-plugin";
import { createNoteCardPlugin } from "../objects/note-card/note-card-plugin";

const applyCustomData = (
  element: OrderedExcalidrawElement,
  patch: { customData: Record<string, unknown> | undefined },
) => newElementWith(element, patch);

export const CANVAS_OBJECT_PLUGINS: readonly CanvasObjectPlugin[] = [
  createNoteCardPlugin(applyCustomData),
  createCodeBlockPlugin(applyCustomData),
] as const;

export const CANVAS_RESIZE_ADAPTERS: readonly CanvasObjectResizeAdapter[] = CANVAS_OBJECT_PLUGINS
  .flatMap((plugin) => (plugin.resizeAdapter ? [plugin.resizeAdapter] : []));

export function decorateDirectionalSpawnWithPlugins(
  source: OrderedExcalidrawElement,
  target: OrderedExcalidrawElement,
): OrderedExcalidrawElement {
  for (const plugin of CANVAS_OBJECT_PLUGINS) {
    if (plugin.matches(source) && plugin.decorateDirectionalSpawn) {
      return plugin.decorateDirectionalSpawn(source, target);
    }
  }
  return target;
}
