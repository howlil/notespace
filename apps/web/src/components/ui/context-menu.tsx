import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./utils";
import { CLOSE_POPUPS_EVENT } from "./dismissable";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuContent({ className, children, ...props }: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          "z-50 min-w-44 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[11px] text-[var(--ink)] shadow-xl shadow-black/10",
          className,
        )}
        {...props}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({ className, children, onSelect, ...props }: ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { children?: ReactNode }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "flex min-h-8 cursor-default select-none items-center gap-2 rounded-md px-2.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--tint)] data-[highlighted]:text-[var(--accent)]",
        className,
      )}
      onSelect={(event) => {
        document.dispatchEvent(new Event(CLOSE_POPUPS_EVENT));
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
        "flex min-h-8 cursor-default select-none items-center justify-between gap-2 rounded-md px-2.5 outline-none data-[state=open]:bg-[var(--tint)] data-[state=open]:text-[var(--accent)] data-[highlighted]:bg-[var(--tint)] data-[highlighted]:text-[var(--accent)]",
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
      <ContextMenuPrimitive.SubContent
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1.5 text-[11px] text-[var(--ink)] shadow-xl shadow-black/10",
          className,
        )}
        {...props}
      >
        {children}
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}
