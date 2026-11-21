// Browser/WebView2 trackpad pinch is delivered as Ctrl/Meta + WheelEvent.
// Keep pan (unmodified wheel) owned by Excalidraw. This transform only
// preserves the scene point under the cursor when the canvas zoom changes.

export type Viewport = { zoom: number; scrollX: number; scrollY: number };
export type PendingPinchViewport = {
  committed: Viewport;
  next: Viewport;
  timeStamp: number;
};
type WheelInput = {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaY: number;
  deltaMode: number;
  clientX: number;
  clientY: number;
};
type SurfaceBounds = { left: number; top: number; width: number; height: number };
type ClosestTarget = { closest: (selector: string) => unknown };

const PENDING_WINDOW_MS = 100;
const CHROME_EXCLUSION_SELECTOR = [
  '[role="toolbar"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  ".context-menu",
  ".Modal",
  ".sidebar",
  ".notespace-note-ui",
  "[data-code-toolbar]",
  "[data-code-toolbar-popup]",
  "iframe",
].join(", ");
const CARD_CONTENT_SELECTOR = "[data-canvas-code-block], [data-note-element]";
const STANDALONE_CONTROL_SELECTOR = "input, select, button";

function sameViewport(left: Viewport, right: Viewport): boolean {
  return left.zoom === right.zoom
    && left.scrollX === right.scrollX
    && left.scrollY === right.scrollY;
}

/**
 * Rapid 120Hz trackpad pinch events can arrive before React commits Excalidraw's
 * previous `updateScene`. Accumulate against the pending viewport while the
 * committed scene snapshot has not yet advanced within the same frame window.
 */
export function pinchBaseViewport(
  committed: Viewport,
  pending: PendingPinchViewport | null,
  timeStamp: number,
): Viewport {
  if (!pending || !sameViewport(committed, pending.committed)) return committed;
  const elapsed = timeStamp - pending.timeStamp;
  return elapsed >= 0 && elapsed < PENDING_WINDOW_MS ? pending.next : committed;
}

/**
 * Allow pinch-to-zoom anywhere on the Canvas surface, including Code and Note
 * cards while editing, while leaving floating chrome, dialogs, sidebars, and
 * embedded iframes outside the Canvas zoom path.
 */
export function isCanvasPinchTarget(target: ClosestTarget): boolean {
  if (target.closest(CHROME_EXCLUSION_SELECTOR)) return false;
  if (target.closest(STANDALONE_CONTROL_SELECTOR) && !target.closest(CARD_CONTENT_SELECTOR)) {
    return false;
  }
  return true;
}

export function canvasPinchViewport(
  viewport: Viewport,
  wheel: WheelInput,
  bounds: SurfaceBounds,
): Viewport | null {
  if ((!wheel.ctrlKey && !wheel.metaKey) || !Number.isFinite(wheel.deltaY) || wheel.deltaY === 0) {
    return null;
  }
  if (
    !Number.isFinite(viewport.zoom) || viewport.zoom <= 0
    || !Number.isFinite(viewport.scrollX) || !Number.isFinite(viewport.scrollY)
    || !Number.isFinite(wheel.clientX) || !Number.isFinite(wheel.clientY)
    || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)
    || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)
    || bounds.width <= 0 || bounds.height <= 0
  ) {
    return null;
  }

  // Wheel deltas may be expressed in pixels, text lines, or pages.
  const unit = wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? bounds.height : 1;
  const delta = Math.max(-10, Math.min(10, wheel.deltaY * unit));
  const zoom = Math.max(0.1, Math.min(30, Math.round((viewport.zoom - delta / 100) * 10000) / 10000));

  const anchorX = Math.max(0, Math.min(bounds.width, wheel.clientX - bounds.left));
  const anchorY = Math.max(0, Math.min(bounds.height, wheel.clientY - bounds.top));
  return {
    zoom,
    scrollX: viewport.scrollX + anchorX / zoom - anchorX / viewport.zoom,
    scrollY: viewport.scrollY + anchorY / zoom - anchorY / viewport.zoom,
  };
}
