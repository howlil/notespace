import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "./utils";

/**
 * Shared visual surface for lightweight, non-modal popovers and menus.
 * Positioning, semantics, and dismissal stay with the feature that owns it.
 */
export const PopupSurface = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<"div">>(
  function PopupSurface({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("rounded-lg border border-line bg-surface shadow-[0_12px_32px_#0002]", className)}
        {...props}
      />
    );
  },
);
