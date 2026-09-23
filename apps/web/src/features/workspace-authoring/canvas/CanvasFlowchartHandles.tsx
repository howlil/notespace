import { AnimatePresence, motion } from "motion/react";
import type { DirectionalSpawnDirection } from "./CanvasDirectionalSpawn";

export type CanvasFlowchartAnchor = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const directions: readonly DirectionalSpawnDirection[] = ["up", "right", "down", "left"];

function arrowFor(direction: DirectionalSpawnDirection) {
  if (direction === "up") return "↑";
  if (direction === "right") return "→";
  if (direction === "down") return "↓";
  return "←";
}

function handlePosition(anchor: CanvasFlowchartAnchor, direction: DirectionalSpawnDirection) {
  const centerX = (anchor.left + anchor.right) / 2;
  const centerY = (anchor.top + anchor.bottom) / 2;
  if (direction === "up") return { left: centerX, top: anchor.top - 18 };
  if (direction === "right") return { left: anchor.right + 18, top: centerY };
  if (direction === "down") return { left: centerX, top: anchor.bottom + 18 };
  return { left: anchor.left - 18, top: centerY };
}

function hintPosition(anchor: CanvasFlowchartAnchor, direction: DirectionalSpawnDirection) {
  const point = handlePosition(anchor, direction);
  if (direction === "up") return { left: point.left, top: point.top - 26 };
  if (direction === "right") return { left: point.left + 42, top: point.top };
  if (direction === "down") return { left: point.left, top: point.top + 26 };
  return { left: point.left - 42, top: point.top };
}

export function CanvasFlowchartHandles({
  anchor,
  previewDirection,
  onPreviewStart,
  onPreviewCancel,
  onCommit,
}: {
  anchor: CanvasFlowchartAnchor | null;
  previewDirection: DirectionalSpawnDirection | null;
  onPreviewStart: (direction: DirectionalSpawnDirection) => void;
  onPreviewCancel: () => void;
  onCommit: (direction: DirectionalSpawnDirection) => void;
}) {
  if (!anchor) return null;

  return (
    <>
      {directions.map((direction) => {
        const position = handlePosition(anchor, direction);
        const active = previewDirection === direction;
        return (
          <motion.button
            key={direction}
            type="button"
            className="fixed z-[95] grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-[14px] leading-none text-muted shadow-sm transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            style={{ left: position.left, top: position.top }}
            initial={false}
            animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : 0.82 }}
            transition={{ duration: 0.12 }}
            aria-label={`Add connected shape ${direction}`}
            title={`Add connected shape ${direction} (Alt + ${arrowFor(direction)})`}
            onPointerEnter={() => onPreviewStart(direction)}
            onPointerLeave={() => onPreviewCancel()}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onCommit(direction);
            }}
          >
            +
          </motion.button>
        );
      })}

      <AnimatePresence>
        {previewDirection && (() => {
          const position = hintPosition(anchor, previewDirection);
          return (
            <motion.div
              key={previewDirection}
              className="pointer-events-none fixed z-[96] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-medium text-muted shadow-sm"
              style={{ left: position.left, top: position.top }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
            >
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line bg-canvas px-1 py-0.5 font-sans text-[9px] text-ink">Alt</kbd>
                <kbd className="rounded border border-line bg-canvas px-1 py-0.5 font-sans text-[9px] text-ink">{arrowFor(previewDirection)}</kbd>
              </span>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
}
