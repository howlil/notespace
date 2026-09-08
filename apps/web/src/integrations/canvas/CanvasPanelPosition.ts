import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface PanelPosition {
  top: number;
  left: number;
  vertical: "above" | "below";
  horizontal: "left" | "right";
}

const viewportGap = 8;
const anchorGap = 8;

export function useCanvasPanelPosition(
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  fallbackWidth: number,
  fallbackHeight: number,
) {
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") return;

    const anchorBounds = anchor.getBoundingClientRect();
    const measuredPanel = panelRef.current;
    const width = measuredPanel?.offsetWidth || fallbackWidth;
    const height = measuredPanel?.offsetHeight || fallbackHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rightSpace = viewportWidth - anchorBounds.right - anchorGap - viewportGap;
    const leftSpace = anchorBounds.left - anchorGap - viewportGap;
    const belowSpace = viewportHeight - anchorBounds.bottom - anchorGap - viewportGap;
    const aboveSpace = anchorBounds.top - anchorGap - viewportGap;
    const openAbove = belowSpace < height && aboveSpace > belowSpace;
    const openLeft = rightSpace < width && leftSpace >= width;
    const preferredTop = openAbove
      ? anchorBounds.top - height - anchorGap
      : anchorBounds.bottom + anchorGap;
    const preferredLeft = openLeft
      ? anchorBounds.left - width - anchorGap
      : anchorBounds.right + anchorGap;

    setPosition({
      top: Math.min(Math.max(viewportGap, preferredTop), Math.max(viewportGap, viewportHeight - height - viewportGap)),
      left: Math.min(Math.max(viewportGap, preferredLeft), Math.max(viewportGap, viewportWidth - width - viewportGap)),
      vertical: openAbove ? "above" : "below",
      horizontal: openLeft ? "left" : "right",
    });
  }, [anchorRef, fallbackHeight, fallbackWidth, panelRef]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    const panel = panelRef.current;
    const resizeObserver = panel && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePosition)
      : null;
    if (resizeObserver && panel) resizeObserver.observe(panel);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, panelRef, updatePosition]);

  return position;
}

export function useCanvasPanelDismiss(open: boolean, panelRef: RefObject<HTMLElement | null>, anchorRef: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const clearCloseTimer = () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    };
    const isInsideSurface = (target: EventTarget | null) => {
      const node = target instanceof Node ? target : null;
      const element = node instanceof Element ? node : null;
      return Boolean(node && (
        panelRef.current?.contains(node)
        || anchorRef.current?.contains(node)
        || element?.closest("[data-canvas-menu-trigger]")
      ));
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (isInsideSurface(event.target)) {
        clearCloseTimer();
        return;
      }
      if (closeTimer.current === null) {
        closeTimer.current = window.setTimeout(() => {
          closeTimer.current = null;
          onClose();
        }, 160);
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideSurface(event.target)) {
        clearCloseTimer();
        onClose();
      }
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      clearCloseTimer();
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [anchorRef, onClose, open, panelRef]);
}
