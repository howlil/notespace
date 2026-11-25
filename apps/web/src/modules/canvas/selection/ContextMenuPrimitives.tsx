import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MenuDivider, MenuItem, SectionLabel, cn, menuRowClass, menuSegmentedBtnClass } from "../../../shared/ui";
import { nativeActionAvailable, nativeActionIcon } from "../core/excalidraw-bridge/CanvasNativeActions";
import {
  NativeDotsHorizontalIcon,
  NativeEmbedIcon,
  NativeFrameIcon,
  NativeLibraryIcon,
} from "../core/excalidraw-bridge/CanvasNativeIcons";
import type { CanvasRuntimeActionName } from "./CanvasSelectionActions";

export const rowClass = menuRowClass;
export const segmentedBtnClass = menuSegmentedBtnClass;

export function MenuSectionHeader({ title, meta }: { title: string; meta?: string }) {
  return <SectionLabel title={title} meta={meta} />;
}

export { MenuDivider };
export const MenuActionRow = MenuItem;

function fallbackIcon(name: CanvasRuntimeActionName) {
  if (name === "wrapSelectionInFrame") return <NativeFrameIcon className="size-3.5" />;
  if (name === "addToLibrary") return <NativeLibraryIcon className="size-3.5" />;
  if (name === "hyperlink") return <NativeEmbedIcon className="size-3.5" />;
  return <NativeDotsHorizontalIcon className="size-3.5" />;
}

export function NativeMenuRow({
  api,
  name,
  label,
  shortcut,
  danger,
  disabled,
  onRun,
  onHover,
}: {
  api: ExcalidrawImperativeAPI;
  name: CanvasRuntimeActionName;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onRun: (name: CanvasRuntimeActionName) => void;
  onHover?: () => void;
}) {
  const icon = nativeActionIcon(api, name) ?? fallbackIcon(name);
  return (
    <MenuActionRow
      icon={icon}
      label={label}
      shortcut={shortcut}
      danger={danger}
      disabled={disabled || !nativeActionAvailable(api, name)}
      onHover={onHover}
      onClick={() => onRun(name)}
    />
  );
}

export function SubmenuItem({
  id,
  openId,
  icon,
  label,
  valueLabel,
  panelClassName,
  onOpen,
  children,
}: {
  id: string;
  openId: string | null;
  icon?: ReactNode;
  label: string;
  valueLabel?: string;
  panelClassName?: string;
  onOpen: (id: string | null) => void;
  children: ReactNode;
}) {
  const open = openId === id;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const triggerEl = triggerRef.current;
      const trigger = triggerEl?.getBoundingClientRect();
      const menuRect = triggerEl?.closest<HTMLElement>("[data-object-context-menu]")?.getBoundingClientRect();
      const sub = subRef.current?.getBoundingClientRect();
      if (!trigger || !sub) return;
      const gap = 6;
      const margin = 8;
      const anchorRight = menuRect ? menuRect.right : trigger.right;
      const anchorLeft = menuRect ? menuRect.left : trigger.left;
      const rightLeft = anchorRight + gap;
      const fitsRight = rightLeft + sub.width <= window.innerWidth - margin;
      const left = fitsRight
        ? rightLeft
        : Math.max(margin, anchorLeft - sub.width - gap);
      const top = Math.max(margin, Math.min(trigger.top - 4, window.innerHeight - sub.height - margin));
      setPos({ left, top });
    };
    update();
    const frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div className="relative" onMouseEnter={() => onOpen(id)}>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(rowClass, open && "bg-tint text-accent")}
        onClick={() => onOpen(open ? null : id)}
      >
        <span className="grid size-3.5 shrink-0 place-items-center text-muted [&_svg]:size-3.5">{icon}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {valueLabel && <span className="max-w-20 truncate text-[11px] text-muted">{valueLabel}</span>}
        <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={subRef}
          data-object-context-submenu={id}
          role="menu"
          aria-label={label}
          className={cn(
            "notespace-selection-actions fixed z-[calc(var(--z-context-menu)+5)] max-h-[min(380px,calc(100dvh-16px))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 text-ink no-scrollbar [box-shadow:var(--shadow-float)]",
            panelClassName ?? "w-48",
          )}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: "hidden" }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {children}
        </div>
      )}
    </div>
  );
}
