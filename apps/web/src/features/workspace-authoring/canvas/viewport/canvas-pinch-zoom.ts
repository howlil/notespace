// Browser/WebView2 trackpad pinch is delivered as Ctrl/Meta + WheelEvent.
// Keep pan (unmodified wheel) owned by Excalidraw. This transform only
// preserves the scene point under the cursor when the canvas zoom changes.

type Viewport = { zoom: number; scrollX: number; scrollY: number };
type WheelInput = {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaY: number;
  deltaMode: number;
  clientX: number;
  clientY: number;
};
type SurfaceBounds = { left: number; top: number; width: number; height: number };

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
  const zoom = Math.max(0.1, Math.min(30, Math.round((viewport.zoom - delta / 100) * 1000) / 1000));

  const anchorX = Math.max(0, Math.min(bounds.width, wheel.clientX - bounds.left));
  const anchorY = Math.max(0, Math.min(bounds.height, wheel.clientY - bounds.top));
  return {
    zoom,
    scrollX: viewport.scrollX + anchorX / zoom - anchorX / viewport.zoom,
    scrollY: viewport.scrollY + anchorY / zoom - anchorY / viewport.zoom,
  };
}
