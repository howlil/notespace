import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { motion } from "motion/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../class-names";
import { IconButton } from "../controls/button";

export const Dialog = DialogPrimitive.Root;

type DialogSize = "sm" | "md" | "lg" | "xl";

const dialogSizeClasses: Record<DialogSize, string> = {
  sm: "w-[min(92vw,420px)]",
  md: "w-[min(92vw,460px)]",
  lg: "w-[min(92vw,560px)]",
  xl: "w-[min(94vw,720px)]",
};

export function DialogContent({
  size = "sm",
  padded = true,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  padded?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay asChild>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="fixed inset-0 z-[var(--z-dialog-overlay)] bg-black/35 backdrop-blur-[2px]"
        />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content asChild {...props}>
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className={cn(
            "fixed left-1/2 top-1/2 z-[var(--z-dialog)] max-h-[calc(100dvh_-_24px)] -translate-x-1/2 -translate-y-1/2 overscroll-contain rounded-xl border border-line bg-surface text-ink no-scrollbar focus:outline-none max-[480px]:w-[calc(100vw_-_24px)]",
            dialogSizeClasses[size],
            padded ? "overflow-y-auto p-5 max-[480px]:p-4" : "overflow-hidden p-0",
            className,
          )}
        >
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = "Close",
  closeDisabled = false,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  className?: string;
}) {
  return (
    <header className={cn("flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2", className)}>
      <div className="min-w-0 flex-1">
        <DialogTitle className="truncate text-nav font-semibold text-ink">{title}</DialogTitle>
        {subtitle && <p className="m-0 truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {(actions || onClose) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {onClose && (
            <IconButton
              type="button"
              size="xs"
              aria-label={closeLabel}
              title={closeLabel}
              disabled={closeDisabled}
              onClick={onClose}
            >
              <X size={14} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      )}
    </header>
  );
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-sm font-medium", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-2 text-xs leading-5 text-muted", className)} {...props} />;
}

export function DialogFooter({ className, children, ...props }: { className?: string; children?: ReactNode } & ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mt-5 flex justify-end gap-2 max-[420px]:flex-col-reverse max-[420px]:[&>*]:w-full", className)} {...props}>{children}</div>;
}

export const DialogClose = DialogPrimitive.Close;
