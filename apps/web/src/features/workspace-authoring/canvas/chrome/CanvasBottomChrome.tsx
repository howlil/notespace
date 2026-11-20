import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ContextualToolbarMode } from "./contextual-toolbar-policy";
import { useContextualToolbarPresentation } from "./use-contextual-toolbar";
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

export function CanvasBottomChrome({ contextual, tools, contextualAnchor, activeTool, contextualVisible = true, mode = "floating", selectionKey = "", interactionActive = false }: {
  contextual: ReactNode;
  tools: ReactNode;
  contextualAnchor?: CanvasContextualAnchor | null;
  activeTool?: string;
  /** False while the user is manipulating, a context menu is open, or the canvas is view-only. */
  contextualVisible?: boolean;
  mode?: ContextualToolbarMode;
  /** Identifies the current selection so settling, Escape dismissal, and chip expansion reset when it changes. */
  selectionKey?: string;
  interactionActive?: boolean;
}) {
  const chromeRef = useRef<HTMLDivElement>(null);
  const contextualRef = useRef<HTMLDivElement>(null);
  const [contextualPosition, setContextualPosition] = useState<CanvasContextualPosition | null>(null);
  const anchored = Boolean(contextualAnchor);
  const { presentation, expand } = useContextualToolbarPresentation({ mode, selectionKey, hasSelection: anchored, suppressed: !contextualVisible, interactionActive });
  const visible = presentation !== "hidden";
  const positionInputs = useRef({ contextualAnchor, activeTool, mode });
  positionInputs.current = { contextualAnchor, activeTool, mode };
  const frameRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    contextualRef.current?.toggleAttribute("inert", !visible);
  }, [visible]);

  const updateContextualPosition = useCallback(() => {
    const surface = chromeRef.current?.getBoundingClientRect();
    const toolbar = contextualRef.current;
    const { contextualAnchor: selectionBounds, activeTool: tool, mode: toolbarMode } = positionInputs.current;
    const toolButton = Array.from(chromeRef.current?.querySelectorAll<HTMLElement>("[data-canvas-tool]") ?? [])
      .find((button) => button.dataset.canvasTool === tool);
    const anchor = selectionBounds ?? toolButton?.getBoundingClientRect();
    if (!surface || !toolbar || !anchor || toolbar.offsetWidth === 0 || toolbar.offsetHeight === 0) {
      setContextualPosition((previous) => sameContextualPosition(previous, null) ? previous : null);
      return;
    }

    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const surfaceGap = 4;
    const compact = surface.width <= 560;
    const railGutter = selectionBounds && !compact ? 72 : surfaceGap;
    const fullyOutside = anchor.right < surface.left || anchor.left > surface.right || anchor.bottom < surface.top || anchor.top > surface.bottom;
    if (fullyOutside) {
      setContextualPosition((previous) => sameContextualPosition(previous, null) ? previous : null);
      return;
    }

    if (selectionBounds && toolbarMode === "docked") {
      const dockLeft = clampContextualPosition(surface.left + (surface.width - width) / 2, surface.left + surfaceGap, surface.right - width - surfaceGap);
      const dockTop = clampContextualPosition(surface.bottom - height - 16, surface.top + surfaceGap, surface.bottom - height - surfaceGap);
      const docked = { top: dockTop, left: dockLeft };
      setContextualPosition((previous) => sameContextualPosition(previous, docked) ? previous : docked);
      return;
    }

    const minLeft = surface.left + railGutter;
    const maxLeft = surface.right - width - surfaceGap;
    const desiredLeft = selectionBounds || compact ? anchor.left + (anchor.right - anchor.left - width) / 2 : anchor.right + 8;
    const left = clampContextualPosition(desiredLeft, minLeft, maxLeft);
    const aboveAnchor = !selectionBounds && compact ? toolButton?.closest('[aria-label="Canvas tools"]')?.getBoundingClientRect().top ?? anchor.top : anchor.top;
    const desiredTop = !selectionBounds && !compact ? anchor.top + (anchor.bottom - anchor.top - height) / 2 : aboveAnchor - height - surfaceGap;
    const preferredTop = selectionBounds && desiredTop < surface.top + surfaceGap ? anchor.bottom + surfaceGap : desiredTop;
    const top = clampContextualPosition(preferredTop, surface.top + surfaceGap, surface.bottom - height - surfaceGap);
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
  }, [activeTool, contextual, contextualAnchor, mode, presentation, schedulePosition, updateContextualPosition]);

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
    <div ref={chromeRef} className="notespace-canvas-chrome pointer-events-none absolute inset-0 z-[90]">
      <div
        ref={contextualRef}
        data-anchored={anchored ? "true" : "false"}
        className="notespace-canvas-contextual-chrome pointer-events-none fixed z-[100] flex max-w-[calc(100vw-16px)] flex-col items-start"
        aria-hidden={!visible}
        style={{ top: contextualPosition?.top ?? 8, left: contextualPosition?.left ?? 8, visibility: contextualPosition && visible ? "visible" : "hidden" }}
      >
        {presentation === "chip" ? (
          <button
            type="button"
            className="pointer-events-auto grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink/70 [box-shadow:var(--shadow-float)] hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Show tools"
            title="Show tools"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={expand}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
          </button>
        ) : contextual}
      </div>
      <div className="notespace-canvas-tool-dock pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 flex-col items-center">
        {tools}
      </div>
    </div>
  );
}
