import {
  CANVAS_PATTERN_STEP,
  shouldRenderCanvasPattern,
  type CanvasBackgroundPattern,
} from "./canvas-background-pattern";

const DOT_PATTERN_ID = "notespace-canvas-dots";
const GRID_PATTERN_ID = "notespace-canvas-grid";

type Viewport = { zoom: number; scrollX: number; scrollY: number };

/**
 * Passive background pattern drawn above Excalidraw's opaque background canvas. It follows pan/zoom
 * from the scene viewport, is skipped when Plain is chosen, Excalidraw's own grid is on, or the
 * pattern would be too dense, and never captures pointer events. Presentation only: not part of the
 * scene or any export.
 */
export function CanvasDotGrid({
  viewport,
  pattern = "dots",
  hidden = false,
}: {
  viewport: Viewport;
  pattern?: CanvasBackgroundPattern;
  hidden?: boolean;
}) {
  if (!shouldRenderCanvasPattern(pattern, viewport.zoom, hidden)) return null;
  const step = CANVAS_PATTERN_STEP * viewport.zoom;
  const half = step / 2;
  const patternId = pattern === "grid" ? GRID_PATTERN_ID : DOT_PATTERN_ID;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-canvas-dot-grid="true"
      data-canvas-background-pattern={pattern}
      className="pointer-events-none absolute inset-0 z-[3] size-full"
    >
      <defs>
        {pattern === "grid" ? (
          <pattern
            id={GRID_PATTERN_ID}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
            x={viewport.scrollX * viewport.zoom}
            y={viewport.scrollY * viewport.zoom}
          >
            <path d={`M ${step} 0.5 H 0 M 0.5 0 V ${step}`} fill="none" stroke="var(--canvas-dot)" strokeOpacity="0.55" strokeWidth="1" />
          </pattern>
        ) : (
          <pattern
            id={DOT_PATTERN_ID}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
            x={viewport.scrollX * viewport.zoom - half}
            y={viewport.scrollY * viewport.zoom - half}
          >
            <circle cx={half} cy={half} r="1" fill="var(--canvas-dot)" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
