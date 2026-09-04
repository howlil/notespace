import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./utils";

export const Dialog = DialogPrimitive.Root;

export function DialogContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]" />
      <DialogPrimitive.Content asChild {...props}>
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl shadow-black/20 focus:outline-none",
            className,
          )}
        >
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-sm font-medium", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-2 text-xs leading-5 text-[var(--muted)]", className)} {...props} />;
}

export function DialogFooter({ className, children, ...props }: { className?: string; children?: ReactNode } & ComponentPropsWithoutRef<"div">) {
  return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props}>{children}</div>;
}

export const DialogClose = DialogPrimitive.Close;
