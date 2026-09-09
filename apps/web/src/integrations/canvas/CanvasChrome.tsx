import {
  BookOpen,
  CircleHelp,
  Copy,
  Download,
  Frame,
  FolderOpen,
  Grid3X3,
  Image,
  Lasso,
  Magnet,
  MoreHorizontal,
  Network,
  PaintBucket,
  Paintbrush,
  RectangleHorizontal,
  RotateCcw,
  Scan,
  Search,
  Shapes,
  Wand2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
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

const primaryTools: readonly { type: ToolbarTool; label: string; shortcut?: string }[] = [
  { type: "selection", label: "Select", shortcut: "V" },
  { type: "hand", label: "Hand", shortcut: "H" },
  { type: "rectangle", label: "Rectangle", shortcut: "R" },
  { type: "diamond", label: "Diamond", shortcut: "D" },
  { type: "ellipse", label: "Ellipse", shortcut: "O" },
  { type: "arrow", label: "Arrow", shortcut: "A" },
  { type: "line", label: "Line", shortcut: "L" },
  { type: "freedraw", label: "Draw", shortcut: "P" },
  { type: "text", label: "Text", shortcut: "T" },
  { type: "image", label: "Image", shortcut: "I" },
  { type: "eraser", label: "Eraser", shortcut: "E" },
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

function NativeSvg({ children, viewBox = "0 0 24 24", strokeWidth = 1.5 }: { children: ReactNode; viewBox?: string; strokeWidth?: number }) {
  return <svg width="18" height="18" viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

// Paths mirror Excalidraw's own tool glyphs. Notespace only owns the button/card styling.
function NativeToolIcon({ type }: { type: ToolbarTool }) {
  switch (type) {
    case "selection":
      return <NativeSvg viewBox="0 0 22 22" strokeWidth={1.25}><path d="M5.5 5.5 9.306 16.31a.335.335 0 0 0 .303.19.336.336 0 0 0 .304-.19l2.002-4.394 4.388-1.828a.326.326 0 0 0 .197-.296.326.326 0 0 0-.197-.296L5.5 5.5Z" /><path d="m12.375 12.375 4.125 4.125" /></NativeSvg>;
    case "hand":
      return <NativeSvg strokeWidth={1.25}><path d="M8 13V7.5a1.5 1.5 0 0 1 3 0V12" /><path d="M11 7.5V6.5a1.5 1.5 0 0 1 3 0V12" /><path d="M14 8.5a1.5 1.5 0 0 1 3 0V12" /><path d="M17 10.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-2c-3 0-5-1-6.7-3.3l-2.4-3.2a1.5 1.5 0 0 1 2.4-1.8L8 14" /></NativeSvg>;
    case "rectangle":
      return <NativeSvg><rect x="4" y="4" width="16" height="16" rx="2" /></NativeSvg>;
    case "diamond":
      return <NativeSvg><path d="M10.5 20.4 3.6 13.5c-.781-.781-.781-2.219 0-3l6.9-6.9c.781-.781 2.219-.781 3 0l6.9 6.9c.781.781.781 2.219 0 3l-6.9 6.9c-.781.781-2.219.781-3 0Z" /></NativeSvg>;
    case "ellipse":
      return <NativeSvg><circle cx="12" cy="12" r="9" /></NativeSvg>;
    case "arrow":
      return <NativeSvg><line x1="5" y1="12" x2="19" y2="12" /><line x1="15" y1="16" x2="19" y2="12" /><line x1="15" y1="8" x2="19" y2="12" /></NativeSvg>;
    case "line":
      return <NativeSvg viewBox="0 0 20 20"><path d="M4.167 10h11.666" /></NativeSvg>;
    case "freedraw":
      return <NativeSvg viewBox="0 0 20 20" strokeWidth={1.25}><path d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z" /><path d="m11.25 5.417 3.333 3.333" /></NativeSvg>;
    case "text":
      return <NativeSvg><line x1="4" y1="20" x2="7" y2="20" /><line x1="14" y1="20" x2="21" y2="20" /><line x1="6.9" y1="15" x2="13.8" y2="15" /><line x1="10.2" y1="6.3" x2="16" y2="20" /><polyline points="5 20 11 4 13 4 20 20" /></NativeSvg>;
    case "image":
      return <NativeSvg viewBox="0 0 20 20" strokeWidth={1.25}><path d="M12.5 6.667h.01" /><path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" /><path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" /><path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" /></NativeSvg>;
    case "eraser":
      return <NativeSvg><path d="M19 20H8.5l-4.21-4.3a1 1 0 0 1 0-1.41l10-10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41L11.5 20" /><path d="M18 13.3 11.7 7" /></NativeSvg>;
    default:
      return <span className="text-[10px] font-medium">?</span>;
  }
}

function ToolButton({ icon, label, shortcut, active, onClick }: { icon: ReactNode; label: string; shortcut?: string; active?: boolean; onClick: () => void }) {
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
      {icon}
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
  const selectTool = (type: ToolbarTool) => {
    if (!api || !availableTools.has(type)) return;
    api.setActiveTool({ type }, { keepSelection: false });
    onCoreToolSelect();
  };
  return (
    <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={motionTransition} className="pointer-events-auto relative flex max-h-[calc(100dvh-16px)] flex-col items-center gap-1 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 max-h-[calc(100dvh-116px)] flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryTools.filter(({ type }) => availableTools.has(type)).map(({ type, label, shortcut }) => (
          <ToolButton key={type} icon={<NativeToolIcon type={type} />} label={label} shortcut={shortcut} active={activeTool === type} onClick={() => selectTool(type)} />
        ))}
      </div>
      <span className="h-px w-5 shrink-0 bg-line" aria-hidden="true" />
      <div data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={(event) => { if (event.pointerType === "mouse" && !diagramOpen) onDiagramToggle(); }}>
        <ToolButton icon={<Network size={16} strokeWidth={1.7} />} label="Diagram" active={diagramOpen} onClick={onDiagramToggle} />
        {diagramPanel}
      </div>
      <div ref={panelAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={(event) => { if (event.pointerType === "mouse" && !moreOpen) onMoreToggle(); }}>
        <ToolButton icon={<MoreHorizontal size={17} strokeWidth={1.7} />} label="More tools" active={moreOpen} onClick={onMoreToggle} />
        <MoreToolsPanel open={moreOpen} anchorRef={panelAnchorRef} api={api} backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} onAction={onAction} onSelectTool={selectTool} onClose={() => { if (moreOpen) onMoreToggle(); }} />
      </div>
    </motion.div>
  );
}

function ViewMenuAction({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void }) {
  return <button type="button" className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent", active && "bg-tint text-accent")} aria-pressed={active} onClick={onClick}><Icon size={14} strokeWidth={1.8} /><span>{label}</span></button>;
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api) { setLibraryOpen(false); return undefined; }
    const sync = (openSidebar: AppState["openSidebar"]) => setLibraryOpen(openSidebar?.name === "default" && openSidebar.tab === "library");
    sync(api.getAppState().openSidebar);
    return api.onStateChange("openSidebar", sync);
  }, [api]);

  useEffect(() => {
    if (!mobileMoreOpen) return undefined;
    const dismiss = (event: PointerEvent) => {
      if (mobileMenuRef.current?.contains(event.target as Node)) return;
      setMobileMoreOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [mobileMoreOpen]);

  const toggleLibrary = () => {
    if (!api) return;
    const openSidebar = api.getAppState().openSidebar;
    const isOpen = openSidebar?.name === "default" && openSidebar.tab === "library";
    api.toggleSidebar({ name: "default", tab: "library", force: !isOpen });
  };

  return (
    <motion.aside initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition} className="pointer-events-auto absolute top-2 right-2 z-20 flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas view controls" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center rounded-lg bg-canvas/70">
        <IconButton type="button" variant="ghost" className="!size-8 shrink-0 text-muted hover:text-ink max-[560px]:hidden" aria-label="Zoom out" title="Zoom out (-)" onClick={() => onAction("zoomOut")}><ZoomOut size={15} strokeWidth={1.8} /></IconButton>
        <button type="button" className="min-w-12 shrink-0 rounded-md px-2 py-1.5 text-[10px] font-medium tabular-nums text-ink hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Reset zoom from ${zoomLabel} to 100%`} title="Reset zoom" onClick={() => onAction("resetZoom")}>{zoomLabel}</button>
        <IconButton type="button" variant="ghost" className="!size-8 shrink-0 text-muted hover:text-ink max-[560px]:hidden" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onAction("zoomIn")}><ZoomIn size={15} strokeWidth={1.8} /></IconButton>
      </div>
      <IconButton type="button" variant="ghost" className="!size-8 shrink-0 text-muted hover:text-ink" aria-label="Fit canvas" title="Fit canvas" onClick={() => onAction("zoomToFit")}><Scan size={15} strokeWidth={1.8} /></IconButton>
      <span className="mx-0.5 h-5 w-px shrink-0 bg-line max-[560px]:hidden" aria-hidden="true" />
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0 max-[560px]:hidden", gridModeEnabled ? "!bg-tint !text-accent ring-1 ring-accent/15" : "text-muted hover:text-accent")} aria-label="Toggle grid" aria-pressed={gridModeEnabled} onClick={() => onAction("gridMode")}><Grid3X3 size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0 max-[560px]:hidden", objectsSnapModeEnabled ? "!bg-tint !text-accent ring-1 ring-accent/15" : "text-muted hover:text-accent")} aria-label="Toggle object snapping" aria-pressed={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")}><Magnet size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0 max-[560px]:hidden", libraryOpen ? "!bg-accent !text-white ring-1 ring-accent/25" : "text-muted hover:text-accent")} aria-label="Browse library" aria-pressed={libraryOpen} onClick={toggleLibrary}><BookOpen size={15} strokeWidth={1.8} /></IconButton>
      <div ref={mobileMenuRef} className="relative hidden max-[560px]:block">
        <IconButton type="button" variant="ghost" className={cn("!size-8 text-muted hover:text-ink", mobileMoreOpen && "!bg-tint !text-accent")} aria-label="More canvas view controls" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen((open) => !open)}><MoreHorizontal size={17} strokeWidth={1.8} /></IconButton>
        {mobileMoreOpen && (
          <div className="absolute top-[calc(100%+7px)] right-0 z-[120] w-44 rounded-lg border border-line bg-surface p-1.5 shadow-none" role="menu" aria-label="More canvas view controls">
            <ViewMenuAction icon={ZoomOut} label="Zoom out" onClick={() => { onAction("zoomOut"); setMobileMoreOpen(false); }} />
            <ViewMenuAction icon={ZoomIn} label="Zoom in" onClick={() => { onAction("zoomIn"); setMobileMoreOpen(false); }} />
            <div className="my-1 h-px bg-line" />
            <ViewMenuAction icon={Grid3X3} label="Grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
            <ViewMenuAction icon={Magnet} label="Object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
            <ViewMenuAction icon={BookOpen} label="Library" active={libraryOpen} onClick={() => { toggleLibrary(); setMobileMoreOpen(false); }} />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
