export type FloatingPlacement = "top" | "bottom";

type RectAnchor = {
  left: number;
  top: number;
  bottom: number;
};

type Size = {
  width: number;
  height: number;
};

type Viewport = {
  width: number;
  height: number;
};

export type FloatingPosition = {
  x: number;
  y: number;
  placement: FloatingPlacement;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeEditorPopup(
  anchor: RectAnchor,
  popup: Size,
  viewport: Viewport,
  options: { gap?: number; padding?: number } = {},
): FloatingPosition {
  const gap = options.gap ?? 8;
  const padding = options.padding ?? 12;
  const below = viewport.height - padding - anchor.bottom;
  const above = anchor.top - padding;
  const needsFlip = below < popup.height + gap && above > below;
  const placement: FloatingPlacement = needsFlip ? "top" : "bottom";

  const x = clamp(anchor.left, padding, viewport.width - popup.width - padding);
  const preferredY = placement === "top"
    ? anchor.top - popup.height - gap
    : anchor.bottom + gap;
  const y = clamp(preferredY, padding, viewport.height - popup.height - padding);

  return { x, y, placement };
}
