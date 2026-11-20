const DOT_STEP = 24;
const MIN_ZOOM = 0.35;
const PATTERN_ID = "notespace-canvas-dots";

type Viewport = { zoom: number; scrollX: number; scrollY: number };

/**
 * Passive dot grid drawn above Excalidraw's opaque background canvas. It follows pan/zoom from the
 * scene viewport, is skipped when Excalidraw's own grid is on or the dots would be too dense, and
 * never captures pointer events. It is presentation only: not part of the scene or any export.
 */
export function CanvasDotGrid({ viewport, hidden = false }: { viewport: Viewport; hidden?: boolean }) {
  if (hidden || viewport.zoom < MIN_ZOOM) return null;
  const step = DOT_STEP * viewport.zoom;
  const half = step / 2;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-canvas-dot-grid="true"
      className="pointer-events-none absolute inset-0 z-[3] size-full"
    >
      <defs>
        <pattern id={PATTERN_ID} width={step} height={step} patternUnits="userSpaceOnUse" x={viewport.scrollX * viewport.zoom - half} y={viewport.scrollY * viewport.zoom - half}>
          <circle cx={half} cy={half} r="1" fill="var(--canvas-dot)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${PATTERN_ID})`} />
    </svg>
  );
}
