export type PanelLayout = { placement: "above" | "below" | "right"; left: number; top: number };
type Bounds = Pick<DOMRect, "top" | "bottom" | "left" | "right" | "width">;

export function selectionPanelPosition(root: Bounds, panel: { width: number; height: number }, surface: Omit<Bounds, "width">, options: { compact: boolean; vertical: boolean }): PanelLayout {
  const gap = 4;
  const desiredGlobalLeft = root.left + (root.width - panel.width) / 2;
  const gutter = options.compact ? gap : 72;
  const right = options.vertical && root.right + gap + panel.width <= surface.right - gap;
  const globalLeft = right ? root.right + gap : Math.min(
    Math.max(desiredGlobalLeft, surface.left + gutter),
    Math.max(surface.left + gutter, surface.right - panel.width - gap),
  );
  const aboveSpace = root.top - surface.top - gap;
  const belowSpace = surface.bottom - root.bottom - gap;
  const placement = right ? "right" : aboveSpace < panel.height && belowSpace > aboveSpace ? "below" : "above";
  const desiredTop = right ? root.top : placement === "below" ? root.bottom + gap : root.top - panel.height - gap;
  const globalTop = Math.min(Math.max(desiredTop, surface.top + gap), Math.max(surface.top + gap, surface.bottom - panel.height - gap));
  return { placement, left: globalLeft - root.left, top: globalTop - root.top };
}
