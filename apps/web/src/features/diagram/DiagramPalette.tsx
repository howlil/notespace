import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Layers3,
  Link2,
  Network,
  Search,
  Shapes,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, IconButton, Input } from "../../components/ui";
import { useCanvasPanelDismiss, useCanvasPanelPosition } from "../../integrations/canvas/CanvasPanelPosition";
import {
  searchEraserCatalog,
  type DiagramCatalogItem,
  type DiagramCategory,
} from "./diagram-model";
import { eraserIconUrlForCatalogKey } from "./eraser-icons";

type BrowseCategory = DiagramCategory | "all";

const categoryLabels: Record<DiagramCategory, string> = {
  general: "General Icons",
  tech: "Tech Logos",
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  oracle: "Oracle Cloud",
  kubernetes: "Kubernetes",
  networking: "Networking",
};

const cloudCategories: readonly DiagramCategory[] = ["aws", "gcp", "azure", "oracle", "kubernetes", "networking"];
const gridColumns = 4;
const gridRowHeight = 72;
const gridViewportHeight = 356;
const panelIconSize = 16;

interface Props {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  activeDiagram: boolean;
  selectedNodeCount: number;
  onInsertNode: (item: DiagramCatalogItem) => void;
  onConnect: () => void;
  onGroup: () => void;
  onAutoLayout: () => void;
  onDetach: () => void;
  onClose: () => void;
}

function EraserIconPreview({ item }: { item: DiagramCatalogItem }) {
  const [failed, setFailed] = useState(false);
  const url = eraserIconUrlForCatalogKey(item.key);

  if (!url || failed) {
    return <span className="grid size-7 place-items-center text-[10px] font-semibold text-ink">{item.glyph}</span>;
  }

  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="size-7 object-contain"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function CategoryRow({ icon, label, detail, onClick, disabled = false }: { icon: React.ReactNode; label: string; detail: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      disabled={disabled}
      className="!min-h-0 w-full justify-start gap-2 rounded-md px-2.5 py-2 text-left transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.985] disabled:cursor-default disabled:opacity-55 disabled:active:scale-100"
      onClick={onClick}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-canvas text-muted [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[9px] text-muted">{detail}</span>
      </span>
      {onClick && <ChevronRight size={panelIconSize} strokeWidth={1.5} className="shrink-0 text-muted" />}
    </Button>
  );
}

export function DiagramPalette({
  open,
  anchorRef,
  activeDiagram,
  selectedNodeCount,
  onInsertNode,
  onConnect,
  onGroup,
  onAutoLayout,
  onDetach,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const position = useCanvasPanelPosition(anchorRef, panelRef, open, 320, 560);
  useCanvasPanelDismiss(open, panelRef, anchorRef, onClose);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BrowseCategory>("all");
  const [cloudOpen, setCloudOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => searchEraserCatalog(query, query.trim() ? "all" : category),
    [category, query],
  );
  const visibleStart = Math.max(0, Math.floor(scrollTop / gridRowHeight) - 2) * gridColumns;
  const visibleEnd = Math.min(items.length, visibleStart + (Math.ceil(gridViewportHeight / gridRowHeight) + 5) * gridColumns);
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalRows = Math.ceil(items.length / gridColumns);
  const topOffset = Math.floor(visibleStart / gridColumns) * gridRowHeight;
  const hasSearch = query.trim().length > 0;
  const showResults = hasSearch || category !== "all";

  useEffect(() => {
    setScrollTop(0);
    gridRef.current?.scrollTo({ top: 0 });
  }, [category, query]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const chooseCategory = (next: BrowseCategory) => {
    setCategory(next);
    setCloudOpen(false);
  };

  if (typeof document === "undefined") return null;

  const vertical = position?.vertical ?? "below";
  const horizontal = position?.horizontal ?? "right";
  const offsetX = horizontal === "left" ? 6 : -6;
  const offsetY = vertical === "above" ? 6 : -6;

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.97, x: offsetX, y: offsetY }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, x: offsetX, y: offsetY }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed z-[1000] flex max-h-[min(680px,calc(100dvh-16px))] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? -10000, left: position?.left ?? -10000, visibility: position ? "visible" : "hidden", transformOrigin: `${horizontal === "left" ? "right" : "left"} ${vertical === "above" ? "bottom" : "top"}` }}
          aria-label="Diagram tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-semibold"><Network size={18} strokeWidth={1.5} className="text-accent" /> Diagram</div>
            <IconButton aria-label="Close diagram tools" title="Close" className="!size-8" onClick={onClose}><X size={panelIconSize} strokeWidth={1.5} /></IconButton>
          </header>

          <div className="border-b border-line p-2">
            <div className="relative">
              <Search size={panelIconSize} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <Input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 3,947 icons..." aria-label="Search all Eraser icons" className="pl-8" />
            </div>
            {!hasSearch && (
              <div className="mt-2">
                <AnimatePresence initial={false} mode="wait">
                  {cloudOpen ? (
                    <motion.div key="cloud" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.14, ease: "easeOut" }}>
                      <Button variant="ghost" size="sm" type="button" className="!min-h-0 mb-1 justify-start gap-1 rounded-none px-2 text-[10px] font-medium text-muted hover:bg-transparent hover:text-ink" onClick={() => setCloudOpen(false)}><ChevronLeft size={panelIconSize} strokeWidth={1.5} /> Cloud &amp; Infrastructure</Button>
                      <div className="grid grid-cols-2 gap-0.5">
                        {cloudCategories.map((item) => <Button variant="ghost" size="sm" key={item} type="button" className={`!min-h-0 justify-start rounded-md px-2 py-1.5 text-left text-[10px] transition-colors ${category === item ? "bg-tint font-medium text-ink" : "text-muted"}`} onClick={() => chooseCategory(item)}>{categoryLabels[item]} <span className="text-[9px] opacity-70">{searchEraserCatalog("", item).length.toLocaleString()}</span></Button>)}
                      </div>
                    </motion.div>
                  ) : category === "all" ? (
                    <motion.div key="all" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.14, ease: "easeOut" }} className="space-y-0.5">
                      <CategoryRow icon={<Shapes strokeWidth={1.5} />} label="General Icons" detail={`${searchEraserCatalog("", "general").length.toLocaleString()} icons`} onClick={() => chooseCategory("general")} />
                      <CategoryRow icon={<Network strokeWidth={1.5} />} label="Tech Logos" detail={`${searchEraserCatalog("", "tech").length.toLocaleString()} icons`} onClick={() => chooseCategory("tech")} />
                      <CategoryRow icon={<Cloud strokeWidth={1.5} />} label="Cloud & Infrastructure" detail={`${cloudCategories.reduce((count, item) => count + searchEraserCatalog("", item).length, 0).toLocaleString()} icons across 6 groups`} onClick={() => setCloudOpen(true)} />
                    </motion.div>
                  ) : (
                    <motion.div key={`category-${category}`} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.14, ease: "easeOut" }}>
                      <Button variant="ghost" size="sm" type="button" className="!min-h-0 justify-start gap-1 rounded-none px-2 text-[10px] font-medium text-muted hover:bg-transparent hover:text-ink" onClick={() => chooseCategory("all")}><ChevronLeft size={panelIconSize} strokeWidth={1.5} /> All Categories <span className="text-ink">/ {categoryLabels[category]}</span></Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {showResults && <>
            <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
              <div className="flex items-center gap-1 text-[9px] text-muted"><span className="font-medium text-ink">{items.length.toLocaleString()}</span> icons{hasSearch ? " found" : ""}</div>
              <span className="rounded-md border border-accent bg-tint px-2 py-1 text-[9px] font-medium text-ink">Icon only</span>
            </div>

            <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto p-2" style={{ maxHeight: gridViewportHeight }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
              {items.length ? (
                <div className="relative" style={{ height: totalRows * gridRowHeight }}>
                  <motion.div key={`${category}:${query.trim()}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="absolute inset-x-0 grid grid-cols-4 gap-1.5" style={{ top: topOffset }}>
                    {visibleItems.map((item) => (
                      <Button variant="ghost" size="sm" key={item.key} type="button" className="group !min-h-0 h-[66px] min-w-0 flex-col gap-1 rounded-md border border-line bg-surface px-1 text-center transition-[color,background-color,border-color,transform] duration-150 hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]" title={`Insert ${item.label}`} aria-label={`Insert ${item.label}`} onClick={() => onInsertNode(item)}>
                        <EraserIconPreview item={item} />
                        <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-muted group-hover:text-ink">{item.label}</span>
                      </Button>
                    ))}
                  </motion.div>
                </div>
              ) : <div className="grid min-h-24 place-items-center px-4 text-center text-[10px] leading-4 text-muted">No Eraser icon matches this search.</div>}
            </div>

            <AnimatePresence initial={false}>
              {activeDiagram && (
                <motion.footer initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="overflow-hidden border-t border-line p-2">
                  <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[.08em] text-muted">Selected diagram</div>
                  <div className="grid grid-cols-2 gap-1.5 [&_svg]:size-4">
                    <Button variant="secondary" size="sm" disabled={selectedNodeCount !== 2} title="Select exactly two diagram nodes" onClick={onConnect}><Link2 strokeWidth={1.5} /> Connect</Button>
                    <Button variant="secondary" size="sm" disabled={selectedNodeCount < 2} title="Select two or more diagram nodes" onClick={onGroup}><Boxes strokeWidth={1.5} /> Group</Button>
                    <Button variant="secondary" size="sm" onClick={onAutoLayout}><Layers3 strokeWidth={1.5} /> Auto layout</Button>
                    <Button variant="ghost" size="sm" title="Keep native shapes but stop structured diagram management" onClick={onDetach}><Unlink strokeWidth={1.5} /> Detach</Button>
                  </div>
                </motion.footer>
              )}
            </AnimatePresence>
          </>}
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}
