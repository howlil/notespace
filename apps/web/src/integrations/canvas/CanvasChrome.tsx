import {
  BookOpen,
  Circle,
  CircleHelp,
  Copy,
  Diamond,
  Download,
  Eraser,
  Frame,
  FolderOpen,
  Hand,
  Image,
  Lasso,
  LineChart,
  Magnet,
  MoreHorizontal,
  MousePointer2,
  Network,
  PaintBucket,
  Paintbrush,
  Pencil,
  RectangleHorizontal,
  RotateCcw,
  Scan,
  Search,
  Shapes,
  SquareDashed,
  Type,
  Wand2,
  Zap,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppState, ExcalidrawImperativeAPI, ToolType } from "@excalidraw/excalidraw/types";
import { IconButton, cn } from "../../components/ui";
import { useCanvasPanelDismiss, useCanvasPanelPosition } from "./CanvasPanelPosition";
import type { CanvasActionName } from "./CanvasToolbar";

type ToolbarTool = ToolType;

const motionTransition = { duration: 0.16, ease: "easeOut" } as const;

const primaryTools: readonly { type: ToolbarTool; label: string; shortcut?: string; icon: LucideIcon }[] = [
  { type: "selection", label: "Select", shortcut: "V", icon: MousePointer2 },
  { type: "hand", label: "Hand", shortcut: "H", icon: Hand },
  { type: "rectangle", label: "Rectangle", shortcut: "R", icon: SquareDashed },
  { type: "diamond", label: "Diamond", shortcut: "D", icon: Diamond },
  { type: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
  { type: "arrow", label: "Arrow", shortcut: "A", icon: LineChart },
  { type: "line", label: "Line", shortcut: "L", icon: LineChart },
  { type: "freedraw", label: "Draw", shortcut: "P", icon: Pencil },
  { type: "text", label: "Text", shortcut: "T", icon: Type },
  { type: "image", label: "Image", shortcut: "I", icon: Image },
  { type: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
];

const secondaryTools: readonly { type: ToolbarTool; label: string; shortcut?: string; icon: LucideIcon }[] = [
  { type: "lasso", label: "Lasso select", icon: Lasso },
  { type: "frame", label: "Frame", shortcut: "F", icon: Frame },
  { type: "embeddable", label: "Embed", icon: RectangleHorizontal },
  { type: "autoshape", label: "Auto shape", icon: Shapes },
  { type: "magicframe", label: "Magic frame", icon: Wand2 },
  { type: "laser", label: "Laser pointer", icon: Zap },
  { type: "bucketfill", label: "Bucket fill", icon: PaintBucket },
];

const canvasBackgroundOptions = [
  { label: "Snow", color: "#ffffff" },
  { label: "Canvas", color: "#f8f9fc" },
  { label: "Mist", color: "#f1f2f6" },
  { label: "Sky", color: "#e8eef6" },
  { label: "Lemon", color: "#fff8e7" },
  { label: "Mint", color: "#eef8f1" },
  { label: "Blush", color: "#fceff1" },
  { label: "Lavender", color: "#f1edff" },
  { label: "Ink", color: "#1d1e24" },
  { label: "Slate", color: "#24262d" },
] as const;

function supportedTools(api: ExcalidrawImperativeAPI | null) {
  return new Set((api ? [...primaryTools, ...secondaryTools].filter(({ type }) => api.app.isToolSupported(type)) : [...primaryTools, ...secondaryTools]).map(({ type }) => type));
}

function ToolButton({ icon: Icon, label, shortcut, active, onClick }: { icon: LucideIcon; label: string; shortcut?: string; active?: boolean; onClick: () => void }) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      className={cn("relative !size-8 shrink-0 text-muted", active ? "!bg-tint !text-accent ring-1 ring-accent/15" : "hover:text-ink")}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      <Icon size={15} strokeWidth={1.8} />
      {shortcut && <kbd className="pointer-events-none absolute right-0.5 bottom-0 text-[7px] font-medium leading-none text-muted">{shortcut}</kbd>}
    </IconButton>
  );
}

function MenuAction({ icon: Icon, label, shortcut, onClick }: { icon: LucideIcon; label: string; shortcut?: string; onClick: () => void }) {
  return (
    <button type="button" className="group flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={onClick}>
      <Icon size={14} strokeWidth={1.8} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <kbd className="rounded border border-line px-1 py-0.5 text-[8px] text-muted group-hover:border-accent group-hover:text-accent">{shortcut}</kbd>}
    </button>
  );
}

function CanvasBackgroundControl({ backgroundColor, onBackgroundChange }: { backgroundColor: string; onBackgroundChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line pb-1">
      <button type="button" className="group flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Paintbrush size={14} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate">Canvas background</span>
        <span className="size-3.5 shrink-0 rounded border border-line" style={{ backgroundColor }} />
      </button>
      {open && (
        <div className="rounded-md border border-line bg-canvas/60 p-2">
          <div className="grid grid-cols-5 gap-1.5">
            {canvasBackgroundOptions.map(({ label, color }) => (
              <button key={color} type="button" className={cn("size-6 rounded border border-line hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent", backgroundColor.toLowerCase() === color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} style={{ backgroundColor: color }} aria-label={`${label} background`} onClick={() => onBackgroundChange(color)} />
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[9px] text-muted">
            <span className="min-w-0 flex-1">Custom color</span>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Custom canvas background" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => onBackgroundChange(event.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}

function MoreToolsPanel({ open, anchorRef, api, backgroundColor, onBackgroundChange, onAction, onSelectTool, onClose }: {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  api: ExcalidrawImperativeAPI | null;
  backgroundColor: string;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  onSelectTool: (type: ToolbarTool) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useCanvasPanelPosition(anchorRef, panelRef, open, 208, 440);
  useCanvasPanelDismiss(open, panelRef, anchorRef, onClose);
  if (typeof document === "undefined") return null;
  const availableTools = supportedTools(api);
  const run = (name: CanvasActionName) => { onAction(name); onClose(); };
  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.97, x: -6 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.97, x: -6 }}
          transition={motionTransition}
          className="fixed z-[1000] flex max-h-[calc(100dvh-16px)] w-[208px] flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? -10000, left: position?.left ?? -10000, visibility: position ? "visible" : "hidden" }}
          aria-label="More canvas tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between border-b border-line px-2.5 py-2">
            <span className="text-[11px] font-medium">More tools</span>
            <IconButton type="button" className="!size-6" aria-label="Close more tools" onClick={onClose}><X size={13} /></IconButton>
          </header>
          <div className="min-h-0 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <section className="grid gap-0.5" aria-label="Additional drawing tools">
              {secondaryTools.filter(({ type }) => availableTools.has(type)).map(({ type, label, shortcut, icon }) => (
                <MenuAction key={type} icon={icon} label={label} shortcut={shortcut} onClick={() => { onSelectTool(type); onClose(); }} />
              ))}
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="Canvas settings">
              <CanvasBackgroundControl backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} />
              <MenuAction icon={RotateCcw} label="Reset canvas" shortcut="⌘⌫" onClick={() => run("clearCanvas")} />
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="File actions">
              <MenuAction icon={FolderOpen} label="Open" shortcut="⌘O" onClick={() => run("loadScene")} />
              <MenuAction icon={Image} label="Export image" shortcut="⇧⌘E" onClick={() => run("imageExport")} />
              <MenuAction icon={Copy} label="Copy as PNG" onClick={() => run("copyAsPng")} />
              <MenuAction icon={Copy} label="Copy as SVG" onClick={() => run("copyAsSvg")} />
              <MenuAction icon={Download} label="Save to file" shortcut="⌘S" onClick={() => run("saveFileToDisk")} />
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="Navigation actions">
              <MenuAction icon={Zap} label="Command palette" shortcut="⌘/" onClick={() => run("commandPalette")} />
              <MenuAction icon={Search} label="Find on canvas" shortcut="⌘F" onClick={() => run("searchMenu")} />
              <MenuAction icon={CircleHelp} label="Help" shortcut="?" onClick={() => run("toggleShortcuts")} />
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}

export function CanvasToolRail({ api, activeTool, panelAnchorRef, diagramOpen, moreOpen, backgroundColor, onDiagramToggle, onMoreToggle, onCoreToolSelect, onBackgroundChange, onAction, diagramPanel }: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  panelAnchorRef: { current: HTMLDivElement | null };
  diagramOpen: boolean;
  moreOpen: boolean;
  backgroundColor: string;
  onDiagramToggle: () => void;
  onMoreToggle: () => void;
  onCoreToolSelect: () => void;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  diagramPanel: ReactNode;
}) {
  const availableTools = supportedTools(api);
  return (
    <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={motionTransition} className="pointer-events-auto relative flex max-h-[calc(100dvh-16px)] flex-col items-center gap-1 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 max-h-[calc(100dvh-116px)] flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryTools.filter(({ type }) => availableTools.has(type)).map(({ type, label, shortcut, icon }) => (
          <ToolButton key={type} icon={icon} label={label} shortcut={shortcut} active={activeTool === type} onClick={() => { api?.setActiveTool({ type }, { keepSelection: true }); onCoreToolSelect(); }} />
        ))}
      </div>
      <span className="h-px w-5 shrink-0 bg-line" aria-hidden="true" />
      <div data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={() => { if (!diagramOpen) onDiagramToggle(); }} onFocusCapture={() => { if (!diagramOpen) onDiagramToggle(); }}>
        <ToolButton icon={Network} label="Diagram" active={diagramOpen} onClick={onDiagramToggle} />
        {diagramPanel}
      </div>
      <div ref={panelAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={() => { if (!moreOpen) onMoreToggle(); }} onFocusCapture={() => { if (!moreOpen) onMoreToggle(); }}>
        <ToolButton icon={MoreHorizontal} label="More tools" active={moreOpen} onClick={onMoreToggle} />
        <MoreToolsPanel open={moreOpen} anchorRef={panelAnchorRef} api={api} backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} onAction={onAction} onSelectTool={(type) => api?.setActiveTool({ type }, { keepSelection: true })} onClose={() => { if (moreOpen) onMoreToggle(); }} />
      </div>
    </motion.div>
  );
}

export function CanvasViewControls({ api, zoom, gridModeEnabled, objectsSnapModeEnabled, onAction }: {
  api: ExcalidrawImperativeAPI | null;
  zoom: number;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onAction: (name: CanvasActionName) => void;
}) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const [libraryOpen, setLibraryOpen] = useState(false);
  useEffect(() => {
    if (!api) { setLibraryOpen(false); return undefined; }
    const sync = (openSidebar: AppState["openSidebar"]) => setLibraryOpen(openSidebar?.name === "default" && openSidebar.tab === "library");
    sync(api.getAppState().openSidebar);
    return api.onStateChange("openSidebar", sync);
  }, [api]);
  const toggleLibrary = () => {
    if (!api) return;
    const openSidebar = api.getAppState().openSidebar;
    const isOpen = openSidebar?.name === "default" && openSidebar.tab === "library";
    api.toggleSidebar({ name: "default", tab: "library", force: !isOpen });
  };
  return (
    <motion.aside initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition} className="pointer-events-auto absolute top-2 right-2 z-10 flex max-w-[calc(100%-64px)] items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface p-1 shadow-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Canvas view controls" onPointerDown={(event) => event.stopPropagation()}>
      <IconButton type="button" variant="ghost" className="!size-8 shrink-0 text-muted hover:text-ink" aria-label="Zoom out" title="Zoom out (-)" onClick={() => onAction("zoomOut")}><ZoomOut size={15} strokeWidth={1.8} /></IconButton>
      <button type="button" className="min-w-11 shrink-0 rounded-md px-1.5 py-1.5 text-[10px] font-medium tabular-nums text-muted hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Reset zoom to ${zoomLabel}`} onClick={() => onAction("resetZoom")}>{zoomLabel}</button>
      <IconButton type="button" variant="ghost" className="!size-8 shrink-0 text-muted hover:text-ink" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onAction("zoomIn")}><ZoomIn size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className="!size-8 shrink-0 text-muted hover:text-ink" aria-label="Fit canvas" title="Fit canvas (Shift+1)" onClick={() => onAction("zoomToFit")}><Scan size={15} strokeWidth={1.8} /></IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0", gridModeEnabled ? "!bg-tint !text-accent ring-1 ring-accent/15" : "text-muted hover:text-accent")} aria-label="Toggle grid" aria-pressed={gridModeEnabled} onClick={() => onAction("gridMode")}><Grid3X3 size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0", objectsSnapModeEnabled ? "!bg-tint !text-accent ring-1 ring-accent/15" : "text-muted hover:text-accent")} aria-label="Toggle object snapping" aria-pressed={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")}><Magnet size={15} strokeWidth={1.8} /></IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0", libraryOpen ? "!bg-accent !text-white ring-1 ring-accent/25" : "text-muted hover:text-accent")} aria-label="Browse library" aria-pressed={libraryOpen} onClick={toggleLibrary}><BookOpen size={15} strokeWidth={1.8} /></IconButton>
    </motion.aside>
  );
}
