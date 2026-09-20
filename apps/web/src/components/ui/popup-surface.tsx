import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "./utils";

/**
 * Shared visual surface for lightweight, non-modal popovers and menus.
 * Positioning, semantics, and dismissal stay with the feature that owns it.
 */
export const PopupSurface = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(
  function PopupSurface({ className, ...props }, ref) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: -4, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className={cn("rounded-lg border border-line bg-surface shadow-[0_12px_32px_#0002] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0", className)}
        {...props}
      />
    );
  },
);
