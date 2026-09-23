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
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, IconButton, Input } from "../../shared/ui";
import { useAnchoredPanelDismiss, useAnchoredPanelPosition } from "../../shared/ui/anchored-panel";
import {
  diagramPickerIconCount,
  searchEraserCatalog,
  type DiagramCatalogItem,
  type DiagramCategory,
} from "./diagram-model";
import { eraserIconUrlForCatalogKey, warmEraserIconPreviews } from "./eraser-icons";

type BrowseCategory = DiagramCategory | "all";

const categoryLabels: Record<DiagramCategory, string> = {
  general: "General Components",
  tech: "Technology & Integrations",
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
const eagerPreviewCount = gridColumns * 2;
const warmPreviewCount = gridColumns * 3;

interface Props {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  activeDiagram: boolean;
  selectedNodeCount: number;
  selectedNodeLabel: string | null;
  selectedEdgeLabel: string | null;
  selectedGroupLabel: string | null;
  onInsertNode: (item: DiagramCatalogItem, drop?: { clientX: number; clientY: number }) => void;
  onConnect: () => void;
  onGroup: () => void;
  onRenameNode: (label: string) => void;
  onRenameEdge: (label: string) => void;
  onDeleteEdge: () => void;
  onRenameGroup: (label: string) => void;
  onUngroup: () => void;
  onAutoLayout: () => void;
  onDetach: () => void;
  onClose: () => void;
}

function EraserIconPreview({ item, eager = false }: { item: DiagramCatalogItem; eager?: boolean }) {
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
      draggable={false}
      className="size-7 object-contain"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function CategoryRow({ icon, label, detail, onClick, onPointerEnter, disabled = false }: { icon: React.ReactNode; label: string; detail: string; onClick?: () => void; onPointerEnter?: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      disabled={disabled}
      className="!min-h-0 w-full justify-start gap-2 rounded-md px-2.5 py-2 text-left transition-[color,background-color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.985] disabled:cursor-default disabled:opacity-55 disabled:active:scale-100"
      onClick={onClick}
      onPointerEnter={onPointerEnter}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-canvas text-muted [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[9px] text-muted">{detail}</span>
      </span>
      {onClick && <ChevronRight size={panelIconSize} strokeWidth={1.5} className="shrink-0 text-muted" />}
    </Button>
  );
}

function submitOnEnter(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.currentTarget.blur();
}

export function DiagramPalette({
  open,
  anchorRef,
  activeDiagram,
  selectedNodeCount,
  selectedNodeLabel,
  selectedEdgeLabel,
  selectedGroupLabel,
  onInsertNode,
  onConnect,
  onGroup,
  onRenameNode,
  onRenameEdge,
  onDeleteEdge,
  onRenameGroup,
  onUngroup,
  onAutoLayout,
  onDetach,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const draggingItemRef = useRef<string | null>(null);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, open, 320, 620);
  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BrowseCategory>("all");
  const [cloudOpen, setCloudOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [nodeLabel, setNodeLabel] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [groupLabel, setGroupLabel] = useState("");
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

  const warmCategory = (next: DiagramCategory) => {
    warmEraserIconPreviews(searchEraserCatalog("", next).map((item) => item.key), warmPreviewCount);
  };

  useEffect(() => {
    setScrollTop(0);
    gridRef.current?.scrollTo({ top: 0 });
  }, [category, query]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
      warmCategory("general");
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !showResults) return;
    warmEraserIconPreviews(items.map((item) => item.key), warmPreviewCount);
  }, [items, open, showResults]);

  useEffect(() => setNodeLabel(selectedNodeLabel ?? ""), [selectedNodeLabel]);
  useEffect(() => setEdgeLabel(selectedEdgeLabel ?? ""), [selectedEdgeLabel]);
  useEffect(() => setGroupLabel(selectedGroupLabel ?? ""), [selectedGroupLabel]);

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
          className="fixed z-[1000] flex max-h-[min(720px,calc(100dvh-16px))] w-[min(320px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
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
              <Input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${diagramPickerIconCount.toLocaleString()} components...`} aria-label="Search diagram components" className="pl-8" />
            </div>
            {!hasSearch && (
              <div className="mt-2">
                <AnimatePresence initial={false} mode="wait">
                  {cloudOpen ? (
                    <motion.div key="cloud" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.14, ease: "easeOut" }}>
                      <Button variant="ghost" size="sm" type="button" className="!min-h-0 mb-1 justify-start gap-1 rounded-none px-2 text-[10px] font-medium text-muted hover:bg-transparent hover:text-ink" onClick={() => setCloudOpen(false)}><ChevronLeft size={panelIconSize} strokeWidth={1.5} /> Cloud &amp; Infrastructure</Button>
                      <div className="grid grid-cols-2 gap-0.5">
                        {cloudCategories.map((item) => <Button variant="ghost" size="sm" key={item} type="button" className={`!min-h-0 justify-start rounded-md px-2 py-1.5 text-left text-[10px] transition-colors ${category === item ? "bg-tint font-medium text-ink" : "text-muted"}`} onPointerEnter={() => warmCategory(item)} onClick={() => chooseCategory(item)}>{categoryLabels[item]} <span className="text-[9px] opacity-70">{searchEraserCatalog("", item).length.toLocaleString()}</span></Button>)}
                      </div>
                    </motion.div>
                  ) : category === "all" ? (
                    <motion.div key="all" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.14, ease: "easeOut" }} className="space-y-0.5">
                      <CategoryRow icon={<Shapes strokeWidth={1.5} />} label="General Components" detail={`${searchEraserCatalog("", "general").length.toLocaleString()} components`} onPointerEnter={() => warmCategory("general")} onClick={() => chooseCategory("general")} />
                      <CategoryRow icon={<Network strokeWidth={1.5} />} label="Technology & Integrations" detail={`${searchEraserCatalog("", "tech").length.toLocaleString()} logos`} onPointerEnter={() => warmCategory("tech")} onClick={() => chooseCategory("tech")} />
                      <CategoryRow icon={<Cloud strokeWidth={1.5} />} label="Cloud & Infrastructure" detail={`${cloudCategories.reduce((count, item) => count + searchEraserCatalog("", item).length, 0).toLocaleString()} components across 6 groups`} onPointerEnter={() => warmCategory("aws")} onClick={() => setCloudOpen(true)} />
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
              <div className="flex items-center gap-1 text-[9px] text-muted"><span className="font-medium text-ink">{items.length.toLocaleString()}</span> components{hasSearch ? " found" : ""}</div>
              <span className="rounded-md bg-tint px-2 py-1 text-[9px] font-medium text-ink">Diagram component</span>
            </div>

            <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto p-2" style={{ maxHeight: gridViewportHeight }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
              {items.length ? (
                <div className="relative" style={{ height: totalRows * gridRowHeight }}>
                  <motion.div key={`${category}:${query.trim()}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }} className="absolute inset-x-0 grid grid-cols-4 gap-1.5" style={{ top: topOffset }}>
                    {visibleItems.map((item, index) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        key={item.key}
                        type="button"
                        draggable
                        className="group !min-h-0 h-[66px] min-w-0 cursor-grab select-none flex-col gap-1 rounded-md bg-surface px-1 text-center transition-[color,background-color,transform] duration-150 hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing active:scale-[0.97]"
                        title={`Insert ${item.label}`}
                        aria-label={`Insert ${item.label}`}
                        onDragStart={(event) => {
                          draggingItemRef.current = item.key;
                          event.dataTransfer.effectAllowed = "copy";
                          event.dataTransfer.setData("application/x-notespace-diagram-node", item.key);
                          event.dataTransfer.setData("text/plain", item.label);
                          event.dataTransfer.setDragImage(event.currentTarget, 33, 33);
                        }}
                        onDragEnd={(event) => {
                          const target = document.elementFromPoint(event.clientX, event.clientY);
                          if (target instanceof Element && target.closest(".notespace-canvas-surface")) {
                            onInsertNode(item, { clientX: event.clientX, clientY: event.clientY });
                          }
                          window.requestAnimationFrame(() => {
                            if (draggingItemRef.current === item.key) draggingItemRef.current = null;
                          });
                        }}
                        onClick={() => {
                          if (draggingItemRef.current === item.key) return;
                          onInsertNode(item);
                        }}
                      >
                        <EraserIconPreview item={item} eager={index < eagerPreviewCount} />
                        <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-muted group-hover:text-ink">{item.label}</span>
                      </Button>
                    ))}
                  </motion.div>
                </div>
              ) : <div className="grid min-h-24 place-items-center px-4 text-center text-[10px] leading-4 text-muted">No system-design component matches this search.</div>}
            </div>
          </>}

          <AnimatePresence initial={false}>
            {activeDiagram && (
              <motion.footer initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="overflow-hidden border-t border-line p-2">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[.08em] text-muted">Selected diagram</div>

                {selectedNodeLabel !== null && (
                  <div className="mb-2">
                    <Input
                      value={nodeLabel}
                      aria-label="Diagram node label"
                      placeholder="Node label"
                      onChange={(event) => setNodeLabel(event.target.value)}
                      onKeyDown={submitOnEnter}
                      onBlur={() => {
                        if (nodeLabel.trim() && nodeLabel.trim() !== selectedNodeLabel) onRenameNode(nodeLabel);
                      }}
                    />
                  </div>
                )}

                {selectedEdgeLabel !== null && (
                  <div className="mb-2 space-y-1.5">
                    <Input
                      value={edgeLabel}
                      aria-label="Diagram connection label"
                      placeholder="Connection label"
                      onChange={(event) => setEdgeLabel(event.target.value)}
                      onKeyDown={submitOnEnter}
                      onBlur={() => {
                        if (edgeLabel.trim() !== selectedEdgeLabel) onRenameEdge(edgeLabel);
                      }}
                    />
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onDeleteEdge}><Trash2 strokeWidth={1.5} /> Delete connection</Button>
                  </div>
                )}

                {selectedGroupLabel !== null && (
                  <div className="mb-2 space-y-1.5">
                    <Input
                      value={groupLabel}
                      aria-label="Diagram group label"
                      placeholder="Boundary label"
                      onChange={(event) => setGroupLabel(event.target.value)}
                      onKeyDown={submitOnEnter}
                      onBlur={() => {
                        if (groupLabel.trim() && groupLabel.trim() !== selectedGroupLabel) onRenameGroup(groupLabel);
                      }}
                    />
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onUngroup}><Unlink strokeWidth={1.5} /> Ungroup boundary</Button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5 [&_svg]:size-4">
                  <Button variant="secondary" size="sm" disabled={selectedNodeCount !== 2} title="Select exactly two diagram nodes" onClick={onConnect}><Link2 strokeWidth={1.5} /> Connect</Button>
                  <Button variant="secondary" size="sm" disabled={selectedNodeCount < 2} title="Select two or more diagram nodes" onClick={onGroup}><Boxes strokeWidth={1.5} /> Group</Button>
                  <Button variant="secondary" size="sm" onClick={onAutoLayout}><Layers3 strokeWidth={1.5} /> Auto layout</Button>
                  <Button variant="ghost" size="sm" title="Keep native shapes but stop structured diagram management" onClick={onDetach}><Unlink strokeWidth={1.5} /> Detach</Button>
                </div>
              </motion.footer>
            )}
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}
