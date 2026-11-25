import { AnimatePresence, motion } from "motion/react";
import { useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "../class-names";
import { useAnchoredPanelDismiss, useAnchoredPanelPosition } from "./anchored-panel";

type AnchoredPopoverProps = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  width: number;
  height: number;
  preferredAxis?: "vertical" | "horizontal" | "rail";
  horizontalAlignment?: "start" | "end";
  insideSelector?: string;
  id?: string;
  role?: "dialog" | "menu";
  "aria-label": string;
  className?: string;
  children: ReactNode;
};

export function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  width,
  height,
  preferredAxis,
  horizontalAlignment,
  insideSelector,
  id,
  role = "dialog",
  "aria-label": ariaLabel,
  className,
  children,
}: AnchoredPopoverProps) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, open, width, height, {
    preferredAxis,
    horizontalAlignment,
  });
  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose, { insideSelector });

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          id={id}
          role={role}
          aria-label={ariaLabel}
          initial={{ opacity: 0, scale: 0.985, y: -3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.985, y: -3 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className={cn(
            "fixed z-[var(--z-popover)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface text-ink no-scrollbar [box-shadow:var(--shadow-float)]",
            className,
          )}
          style={{
            top: position?.top ?? 8,
            left: position?.left ?? 8,
            visibility: position ? "visible" : "hidden",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {children}
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
