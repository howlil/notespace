/**
 * Passive Canvas background motif preference. Presentation only: never serialized into the
 * Excalidraw scene or exports, and hidden whenever Excalidraw's own snapping Grid mode is enabled.
 */
export type CanvasBackgroundPattern = "none" | "dots" | "grid";

export const CANVAS_BACKGROUND_PATTERN_STORAGE_KEY = "notespace.canvas.backgroundPattern";
export const CANVAS_PATTERN_STEP = 24;
export const CANVAS_PATTERN_MIN_ZOOM = 0.35;

export const CANVAS_BACKGROUND_PATTERNS: readonly {
  pattern: CanvasBackgroundPattern;
  label: string;
  ariaLabel: string;
}[] = [
  { pattern: "none", label: "Plain", ariaLabel: "Plain background pattern" },
  { pattern: "dots", label: "Dots", ariaLabel: "Dots background pattern" },
  { pattern: "grid", label: "Grid", ariaLabel: "Grid background pattern" },
];

export function parseCanvasBackgroundPattern(value: string | null | undefined): CanvasBackgroundPattern {
  return value === "none" || value === "grid" ? value : "dots";
}

export function shouldRenderCanvasPattern(
  pattern: CanvasBackgroundPattern,
  zoom: number,
  hidden: boolean,
): boolean {
  return pattern !== "none" && !hidden && Number.isFinite(zoom) && zoom >= CANVAS_PATTERN_MIN_ZOOM;
}
