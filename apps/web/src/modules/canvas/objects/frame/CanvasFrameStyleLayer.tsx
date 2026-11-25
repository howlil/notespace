import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { readCanvasFrameStyle } from "./canvas-frame-style";

type FrameViewport = { scrollX: number; scrollY: number; zoom: number };

export function CanvasFrameStyleLayer({
  elements,
  viewport,
  appDark,
}: {
  elements: readonly ExcalidrawElement[];
  viewport: FrameViewport;
  appDark: boolean;
}) {
  const styledFrames = elements.flatMap((element) => {
    if (element.isDeleted) return [];
    const style = readCanvasFrameStyle(element);
    if (!style) return [];
    return [{ element, style }];
  });

  if (styledFrames.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-clip" aria-hidden="true">
      {styledFrames.map(({ element, style }) => {
        const left = (element.x + viewport.scrollX) * viewport.zoom;
        const top = (element.y + viewport.scrollY) * viewport.zoom;
        const width = element.width * viewport.zoom;
        const height = element.height * viewport.zoom;
        const boxStyle = {
          left,
          top,
          width,
          height,
          borderRadius: 8,
          opacity: (element.opacity ?? 100) / 100,
        };
        return (
          <div key={element.id} data-canvas-frame-style={element.id}>
            {style.backgroundColor && (
              <div
                className="pointer-events-none absolute"
                style={{
                  ...boxStyle,
                  backgroundColor: `color-mix(in srgb, ${style.backgroundColor} 50%, transparent)`,
                  mixBlendMode: appDark ? "normal" : "multiply",
                }}
              />
            )}
            {style.strokeColor && (
              <div
                className="pointer-events-none absolute box-border"
                style={{
                  ...boxStyle,
                  border: `2px solid ${style.strokeColor}`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
