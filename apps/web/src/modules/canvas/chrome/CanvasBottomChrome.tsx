import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type CanvasContextualAnchor = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CanvasContextualPosition = { top: number; left: number };

function sameContextualPosition(previous: CanvasContextualPosition | null, next: CanvasContextualPosition | null) {
  return previous?.top === next?.top && previous?.left === next?.left;
}

function clampContextualPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function CanvasBottomChrome({
  contextual,
  tools,
  activeTool,
  contextualVisible = true,
}: {
  contextual: ReactNode;
  tools: ReactNode;
  activeTool?: string;
  /** False while the user is manipulating, a context menu is open, or the canvas is view-only. */
  contextualVisible?: boolean;
}) {
  const chromeRef = useRef<HTMLDivElement>(null);
  const contextualRef = useRef<HTMLDivElement>(null);
  const [contextualPosition, setContextualPosition] = useState<CanvasContextualPosition | null>(null);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    contextualRef.current?.toggleAttribute("inert", !contextualVisible);
  }, [contextualVisible]);

  const updateContextualPosition = useCallback(() => {
    const surface = chromeRef.current?.getBoundingClientRect();
    const toolbar = contextualRef.current;
    const tool = activeToolRef.current;
    const toolButton = Array.from(chromeRef.current?.querySelectorAll<HTMLElement>("[data-canvas-tool]") ?? [])
      .find((button) => button.dataset.canvasTool === tool);
    const anchor = toolButton?.getBoundingClientRect();
    if (!surface || !toolbar || !anchor || toolbar.offsetWidth === 0 || toolbar.offsetHeight === 0) {
      setContextualPosition((previous) => sameContextualPosition(previous, null) ? previous : null);
      return;
    }

    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const surfaceGap = 4;
    const compact = surface.width <= 560;
    const fullyOutside = anchor.right < surface.left || anchor.left > surface.right || anchor.bottom < surface.top || anchor.top > surface.bottom;
    if (fullyOutside) {
      setContextualPosition((previous) => sameContextualPosition(previous, null) ? previous : null);
      return;
    }

    const minLeft = surface.left + surfaceGap;
    const maxLeft = surface.right - width - surfaceGap;
    const desiredLeft = compact ? anchor.left + (anchor.right - anchor.left - width) / 2 : anchor.right + 8;
    const left = clampContextualPosition(desiredLeft, minLeft, maxLeft);
    const aboveAnchor = compact ? toolButton?.closest('[aria-label="Canvas tools"]')?.getBoundingClientRect().top ?? anchor.top : anchor.top;
    const desiredTop = !compact ? anchor.top - 4 : aboveAnchor - height - surfaceGap;
    const top = clampContextualPosition(desiredTop, surface.top + surfaceGap, surface.bottom - height - surfaceGap);
    const next = { top, left };
    setContextualPosition((previous) => sameContextualPosition(previous, next) ? previous : next);
  }, []);

  const schedulePosition = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateContextualPosition();
    });
  }, [updateContextualPosition]);

  useLayoutEffect(() => {
    updateContextualPosition();
    schedulePosition();
  }, [activeTool, contextual, contextualVisible, schedulePosition, updateContextualPosition]);

  useLayoutEffect(() => {
    const toolbar = contextualRef.current;
    const resizeObserver = toolbar && typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedulePosition) : null;
    if (resizeObserver && toolbar) resizeObserver.observe(toolbar);
    const surface = chromeRef.current;
    if (resizeObserver && surface) resizeObserver.observe(surface);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  }, [schedulePosition]);

  return (
    <div ref={chromeRef} className="notespace-canvas-chrome pointer-events-none absolute inset-0 z-[var(--z-canvas-chrome)]">
      <div
        ref={contextualRef}
        className="notespace-canvas-contextual-chrome pointer-events-none fixed z-[var(--z-popover)] flex max-w-[calc(100vw-16px)] flex-col items-start"
        aria-hidden={!contextualVisible}
        style={{ top: contextualPosition?.top ?? 8, left: contextualPosition?.left ?? 8, visibility: contextualPosition && contextualVisible ? "visible" : "hidden" }}
      >
        {contextual}
      </div>
      <div className="notespace-canvas-tool-dock pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 flex-col items-center">
        {tools}
      </div>
    </div>
  );
}
