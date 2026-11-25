import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useExclusivePopup } from "../../../shared/ui/overlays/dismissable";
import type { CanvasRuntimeActionName } from "./CanvasSelectionActions";
import { CanvasMenuBody, SelectionMenuBody } from "./NativeSelectionMenuBody";

type MenuPoint = { x: number; y: number };

export type ContextMenuSlotContext = {
  openSub: string | null;
  setOpenSub: (id: string | null) => void;
  onClose: () => void;
};

type Props = {
  point: MenuPoint | null;
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  selectedElementCount: number;
  fullMode?: boolean;
  gridModeEnabled?: boolean;
  objectsSnapModeEnabled?: boolean;
  viewModeEnabled?: boolean;
  renderCustomBody?: (ctx: ContextMenuSlotContext) => ReactNode;
  onToggleFullMode?: () => void;
  onAction: (name: CanvasRuntimeActionName) => void;
  onClose: () => void;
};

export function CanvasObjectContextMenu({
  point,
  api,
  activeTool,
  selectedElementCount,
  fullMode = false,
  gridModeEnabled = false,
  objectsSnapModeEnabled = false,
  viewModeEnabled = false,
  renderCustomBody,
  onToggleFullMode,
  onAction,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const close = useCallback(() => {
    setOpenSub(null);
    onClose();
  }, [onClose]);

  const customBody = point && renderCustomBody ? renderCustomBody({ openSub, setOpenSub, onClose: close }) : null;
  const open = point !== null && (Boolean(customBody) || Boolean(api));

  useExclusivePopup(open, close);

  useEffect(() => {
    if (!open) setOpenSub(null);
  }, [open, point]);

  useLayoutEffect(() => {
    if (!open || !point) {
      setPos(null);
      return;
    }
    const update = () => {
      const menu = menuRef.current?.getBoundingClientRect();
      if (!menu) return;
      const margin = 8;
      const left = Math.max(margin, Math.min(point.x, window.innerWidth - menu.width - margin));
      const top = Math.max(margin, Math.min(point.y, window.innerHeight - menu.height - margin));
      setPos({ left, top });
    };
    update();
    const frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [open, point]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-object-context-submenu]")) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      document.querySelector<HTMLElement>(".notespace-canvas-surface .excalidraw")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [close, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      data-object-context-menu
      role="menu"
      aria-label="Object context menu"
      className="fixed z-[var(--z-context-menu)] grid w-[var(--sidebar-width)] max-h-[calc(100dvh-16px)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 text-ink no-scrollbar [box-shadow:var(--shadow-float)]"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999, visibility: "hidden" }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {customBody ? customBody : api && selectedElementCount > 0 ? (
        <SelectionMenuBody
          api={api}
          activeTool={activeTool}
          selectedElementCount={selectedElementCount}
          openSub={openSub}
          setOpenSub={setOpenSub}
          onAction={onAction}
          onClose={close}
        />
      ) : api ? (
        <CanvasMenuBody
          api={api}
          fullMode={fullMode}
          gridModeEnabled={gridModeEnabled}
          objectsSnapModeEnabled={objectsSnapModeEnabled}
          viewModeEnabled={viewModeEnabled}
          onToggleFullMode={onToggleFullMode}
          onAction={onAction}
          onClose={close}
        />
      ) : null}
    </div>,
    document.body,
  );
}
