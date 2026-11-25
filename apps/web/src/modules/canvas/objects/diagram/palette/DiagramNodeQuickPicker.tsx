import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { IconButton, Input } from "../../../../../shared/ui";
import {
  diagramPickerIconCount,
  searchEraserCatalog,
  type DiagramCatalogItem,
} from "../model/diagram";
import { eraserIconUrlForCatalogKey } from "./eraser-icons";

export type DiagramNodeQuickPickerTarget = {
  nodeId: string;
  rect: { left: number; top: number; right: number; bottom: number };
};

const maxResults = 16;
const columns = 4;
const panelWidth = 276;
const estimatedHeight = 286;

function computePosition(rect: DiagramNodeQuickPickerTarget["rect"]) {
  if (typeof window === "undefined") return { left: 8, top: 8 };
  const gap = 12;
  const margin = 10;
  const rightSpace = window.innerWidth - rect.right - gap - margin;
  const leftSpace = rect.left - gap - margin;
  const left = rightSpace >= panelWidth || rightSpace >= leftSpace
    ? Math.min(rect.right + gap, window.innerWidth - panelWidth - margin)
    : Math.max(margin, rect.left - panelWidth - gap);
  const top = Math.max(margin, Math.min(rect.top - 8, window.innerHeight - estimatedHeight - margin));
  return { left, top };
}

function QuickPickerIcon({ item }: { item: DiagramCatalogItem }) {
  const src = eraserIconUrlForCatalogKey(item.key);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="grid size-7 place-items-center rounded bg-tint text-[11px] font-medium text-ink">
        {item.glyph}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
      className="size-7 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function DiagramNodeQuickPicker({
  target,
  onSelect,
  onClose,
}: {
  target: DiagramNodeQuickPickerTarget | null;
  onSelect: (nodeId: string, item: DiagramCatalogItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  const onCloseRef = useRef(onClose);
  onSelectRef.current = onSelect;
  onCloseRef.current = onClose;

  const items = useMemo(
    () => searchEraserCatalog(query, "all").slice(0, maxResults),
    [query],
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, target?.nodeId]);

  const targetNodeId = target?.nodeId ?? null;

  useEffect(() => {
    if (!targetNodeId) return undefined;
    setQuery("");
    const focusInput = () => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    };
    const frame = window.requestAnimationFrame(focusInput);
    const timer = window.setTimeout(focusInput, 60);

    const handlePointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && panelRef.current?.contains(node)) return;
      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      const list = itemsRef.current;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const picked = list[activeIndexRef.current] ?? list[0];
        if (picked) {
          onSelectRef.current(targetNodeId, picked);
          onCloseRef.current();
        }
        return;
      }
      if (!list.length) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveIndex((index) => (index + 1) % list.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveIndex((index) => (index - 1 + list.length) % list.length);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveIndex((index) => Math.min(list.length - 1, index + columns));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setActiveIndex((index) => Math.max(0, index - columns));
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [targetNodeId]);

  if (typeof document === "undefined") return null;
  const position = target ? computePosition(target.rect) : { left: 8, top: 8 };

  return createPortal((
    <AnimatePresence initial={false}>
      {target && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.97, y: 3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 3 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className="fixed z-[var(--z-popover)] flex w-[276px] flex-col overflow-hidden rounded-lg border border-line bg-surface p-1.5 text-ink [box-shadow:var(--shadow-float)]"
          style={{ left: position.left, top: position.top }}
          role="dialog"
          aria-label="Choose diagram component"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search size={12} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${diagramPickerIconCount.toLocaleString()} components…`}
                aria-label="Search diagram component"
                className="!h-7 !min-h-0 pl-6.5 text-[12px]"
              />
            </div>
            <IconButton
              type="button"
              aria-label="Close component picker"
              title="Close (Esc)"
              className="!size-6 shrink-0"
              onClick={onClose}
            >
              <X size={12} strokeWidth={1.5} />
            </IconButton>
          </div>

          <div className="no-scrollbar mt-1.5 max-h-[228px] overflow-y-auto">
            {items.length ? (
              <div className="grid grid-cols-4 gap-1">
                {items.map((item, index) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={item.label}
                      className={`flex h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 text-center transition-colors ${
                        active
                          ? "bg-tint text-accent ring-1 ring-accent/25"
                          : "bg-surface text-ink hover:bg-tint/70"
                      }`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        onSelect(target.nodeId, item);
                        onClose();
                      }}
                    >
                      <QuickPickerIcon item={item} />
                      <span className="w-full truncate text-[9px] text-muted">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-16 place-items-center px-3 text-center text-[11px] text-muted">
                No matching component.
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}
