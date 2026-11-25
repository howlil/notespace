import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { motion } from "motion/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../class-names";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content asChild {...props}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "z-[var(--z-context-menu)] min-w-44 overflow-hidden rounded-lg border border-line bg-surface p-1 text-sm text-ink [box-shadow:var(--shadow-popup)]",
            className,
          )}
        >
          {children}
        </motion.div>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({ className, children, onSelect, ...props }: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { children?: ReactNode }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "flex min-h-[26px] cursor-default select-none items-center gap-2 rounded-md px-2 py-0.5 outline-none transition-[color,background-color] duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-tint data-[highlighted]:text-accent",
        className,
      )}
      onSelect={(event) => {
        onSelect?.(event);
      }}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuSubTrigger({ className, children, ...props }: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & { children?: ReactNode }) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(
        "flex min-h-[26px] cursor-default select-none items-center justify-between gap-2 rounded-md px-2 py-0.5 outline-none transition-[color,background-color] duration-100 data-[state=open]:bg-tint data-[state=open]:text-accent data-[highlighted]:bg-tint data-[highlighted]:text-accent",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      <ChevronRight size={13} aria-hidden="true" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent asChild {...props}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "z-[var(--z-context-menu)] min-w-44 overflow-hidden rounded-lg border border-line bg-surface p-1 text-sm text-ink [box-shadow:var(--shadow-popup)]",
            className,
          )}
        >
          {children}
        </motion.div>
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}
