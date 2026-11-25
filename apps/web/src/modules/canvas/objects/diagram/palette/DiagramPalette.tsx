import {
  Boxes,
  Layers3,
  Link2,
  Network,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AnchoredPopover, Button, IconButton, Input, SearchInput, SegmentedControl } from "../../../../../shared/ui";
import {
  diagramPickerIconCount,
  searchEraserCatalog,
  type DiagramCatalogItem,
  type DiagramCategory,
} from "../model/diagram";
import { eraserIconUrlForCatalogKey, warmEraserIconPreviews } from "./eraser-icons";

type BrowseCategory = DiagramCategory | "all";

const filterTabs = [
  { value: "all", label: "All" },
  { value: "general", label: "General" },
  { value: "tech", label: "Tech" },
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
  { value: "azure", label: "Azure" },
  { value: "kubernetes", label: "K8s" },
  { value: "networking", label: "Network" },
  { value: "oracle", label: "Oracle" },
] as const;

const gridColumns = 4;
const gridRowHeight = 66;
const gridViewportHeight = 316;
const eagerPreviewCount = gridColumns * 3;
const warmPreviewCount = gridColumns * 4;

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const draggingItemRef = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<BrowseCategory>("all");
  const [scrollTop, setScrollTop] = useState(0);
  const [nodeLabel, setNodeLabel] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [groupLabel, setGroupLabel] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const trimmed = query.trim();
    const scoped = searchEraserCatalog(trimmed, category);
    if (trimmed && scoped.length === 0 && category !== "all") {
      return searchEraserCatalog(trimmed, "all");
    }
    return scoped;
  }, [category, query]);

  const visibleStart = Math.max(0, Math.floor(scrollTop / gridRowHeight) - 2) * gridColumns;
  const visibleEnd = Math.min(items.length, visibleStart + (Math.ceil(gridViewportHeight / gridRowHeight) + 5) * gridColumns);
  const visibleItems = items.slice(visibleStart, visibleEnd);
  const totalRows = Math.ceil(items.length / gridColumns);
  const topOffset = Math.floor(visibleStart / gridColumns) * gridRowHeight;

  const warmCategory = (next: BrowseCategory) => {
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
      warmCategory(category);
    });
    return () => cancelAnimationFrame(frame);
  }, [category, open]);

  useEffect(() => {
    if (!open) return;
    warmEraserIconPreviews(items.map((item) => item.key), warmPreviewCount);
  }, [items, open]);

  useEffect(() => setNodeLabel(selectedNodeLabel ?? ""), [selectedNodeLabel]);
  useEffect(() => setEdgeLabel(selectedEdgeLabel ?? ""), [selectedEdgeLabel]);
  useEffect(() => setGroupLabel(selectedGroupLabel ?? ""), [selectedGroupLabel]);

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      width={316}
      height={480}
      preferredAxis="rail"
      aria-label="Diagram tools"
      className="flex max-h-[min(640px,calc(100dvh-16px))] w-[min(316px,calc(100vw-24px))] flex-col overflow-hidden"
    >
      <header className="flex h-9 items-center justify-between gap-2 border-b border-line px-2.5">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Network size={14} strokeWidth={1.5} className="text-muted" />
          <span>Diagram</span>
          <span className="text-xs font-normal tabular-nums text-muted">
            {items.length.toLocaleString()}
          </span>
        </div>
        <IconButton aria-label="Close diagram tools" title="Close" size="xs" onClick={onClose}>
          <X size={13} strokeWidth={1.5} />
        </IconButton>
      </header>

      <div className="space-y-1.5 border-b border-line p-1.5">
        <SearchInput
          ref={searchInputRef}
          value={query}
          onChange={setQuery}
          clearable
          onClear={() => searchInputRef.current?.focus()}
          placeholder={`Search ${diagramPickerIconCount.toLocaleString()} components…`}
          aria-label="Search diagram components"
        />

        <div
          ref={tabsRef}
          className="overflow-x-auto no-scrollbar"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && tabsRef.current) {
              tabsRef.current.scrollLeft += event.deltaY;
            }
          }}
        >
          <SegmentedControl
            variant="tabs"
            aria-label="Component categories"
            options={filterTabs}
            value={category}
            onChange={(next) => {
              warmCategory(next);
              setCategory(next);
            }}
            className="gap-0.5"
          />
        </div>
      </div>

      <div
        ref={gridRef}
        className="min-h-0 flex-1 overflow-y-auto p-1.5 no-scrollbar"
        style={{ maxHeight: gridViewportHeight }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {items.length ? (
          <div className="relative" style={{ height: totalRows * gridRowHeight }}>
            <div className="absolute inset-x-0 grid grid-cols-4 gap-1" style={{ top: topOffset }}>
              {visibleItems.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  draggable
                  className="group flex h-[62px] min-w-0 cursor-grab select-none flex-col items-center justify-center gap-1 rounded-md bg-surface px-1 text-center transition-[color,background-color,transform] duration-100 hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing active:scale-[0.97]"
                  title={`Insert ${item.label}`}
                  aria-label={`Insert ${item.label}`}
                  onDragStart={(event) => {
                    draggingItemRef.current = item.key;
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData("application/x-notespace-diagram-node", item.key);
                    event.dataTransfer.setData("text/plain", item.label);
                    event.dataTransfer.setDragImage(event.currentTarget, 31, 31);
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
                  <span className="w-full truncate text-2xs text-muted group-hover:text-ink">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid min-h-24 place-items-center px-4 text-center text-xs leading-4 text-muted">
            No component matches “{query}”.
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {activeDiagram && (
          <motion.footer
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="overflow-hidden border-t border-line bg-sidebar/30 p-1.5"
          >
            {selectedNodeLabel !== null && (
              <div className="mb-1.5">
                <Input
                  inputSize="sm"
                  value={nodeLabel}
                  aria-label="Diagram node label"
                  placeholder="Node label"
                  className="text-xs"
                  onChange={(event) => setNodeLabel(event.target.value)}
                  onKeyDown={submitOnEnter}
                  onBlur={() => {
                    if (nodeLabel.trim() && nodeLabel.trim() !== selectedNodeLabel) onRenameNode(nodeLabel);
                  }}
                />
              </div>
            )}

            {selectedEdgeLabel !== null && (
              <div className="mb-1.5 flex items-center gap-1">
                <Input
                  inputSize="sm"
                  value={edgeLabel}
                  aria-label="Diagram connection label"
                  placeholder="Connection label"
                  className="flex-1 text-xs"
                  onChange={(event) => setEdgeLabel(event.target.value)}
                  onKeyDown={submitOnEnter}
                  onBlur={() => {
                    if (edgeLabel.trim() !== selectedEdgeLabel) onRenameEdge(edgeLabel);
                  }}
                />
                <IconButton
                  type="button"
                  size="sm"
                  className="shrink-0 text-muted hover:text-danger"
                  aria-label="Delete connection"
                  title="Delete connection"
                  onClick={onDeleteEdge}
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </IconButton>
              </div>
            )}

            {selectedGroupLabel !== null && (
              <div className="mb-1.5 flex items-center gap-1">
                <Input
                  inputSize="sm"
                  value={groupLabel}
                  aria-label="Diagram group label"
                  placeholder="Boundary label"
                  className="flex-1 text-xs"
                  onChange={(event) => setGroupLabel(event.target.value)}
                  onKeyDown={submitOnEnter}
                  onBlur={() => {
                    if (groupLabel.trim() && groupLabel.trim() !== selectedGroupLabel) onRenameGroup(groupLabel);
                  }}
                />
                <IconButton
                  type="button"
                  size="sm"
                  className="shrink-0 text-muted hover:text-ink"
                  aria-label="Ungroup boundary"
                  title="Ungroup boundary"
                  onClick={onUngroup}
                >
                  <Unlink size={13} strokeWidth={1.5} />
                </IconButton>
              </div>
            )}

            <div className="grid grid-cols-4 gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1 px-1.5 text-xs"
                disabled={selectedNodeCount !== 2}
                title="Connect two selected nodes"
                onClick={onConnect}
              >
                <Link2 size={12} strokeWidth={1.5} /> Connect
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1 px-1.5 text-xs"
                disabled={selectedNodeCount < 2}
                title="Group selected nodes"
                onClick={onGroup}
              >
                <Boxes size={12} strokeWidth={1.5} /> Group
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1 px-1.5 text-xs"
                title="Auto layout diagram"
                onClick={onAutoLayout}
              >
                <Layers3 size={12} strokeWidth={1.5} /> Layout
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 px-1.5 text-xs"
                title="Keep shapes and detach from structured diagram"
                onClick={onDetach}
              >
                <Unlink size={12} strokeWidth={1.5} /> Detach
              </Button>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </AnchoredPopover>
  );
}
