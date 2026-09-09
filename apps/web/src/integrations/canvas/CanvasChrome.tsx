import { Network, Zap } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { AppState, ExcalidrawImperativeAPI, ToolType } from "@excalidraw/excalidraw/types";
import { IconButton, cn } from "../../components/ui";
import { useCanvasPanelDismiss, useCanvasPanelPosition } from "./CanvasPanelPosition";
import { nativeActionIcon } from "./CanvasNativeActions";
import {
  NativeArrowIcon,
  NativeAutoshapeIcon,
  NativeBucketFillIcon,
  NativeDiamondIcon,
  NativeDotsHorizontalIcon,
  NativeEllipseIcon,
  NativeEmbedIcon,
  NativeEraserIcon,
  NativeFrameIcon,
  NativeFreedrawIcon,
  NativeHandIcon,
  NativeImageIcon,
  NativeLassoIcon,
  NativeLibraryIcon,
  NativeLineIcon,
  NativeMagicIcon,
  NativeRectangleIcon,
  NativeSelectionIcon,
  NativeTextIcon,
} from "./CanvasNativeIcons";
import type { CanvasActionName } from "./CanvasToolbar";

type ToolbarTool = ToolType;
type GlyphComponent = ComponentType<SVGProps<SVGSVGElement>>;

type ToolDefinition = {
  type: ToolbarTool;
  label: string;
  shortcut?: string;
  glyph: GlyphComponent;
  nativeAction?: string;
};

const motionTransition = { duration: 0.16, ease: "easeOut" } as const;
const controlGlyphClass = "size-4";

// Excalidraw tool semantics come from its current Tools.tsx mapping. Stable
// runtime action icons win when the installed build exposes one; this glyph
// adapter is the explicit fallback for internal icons that are not public API.
const primaryTools: readonly ToolDefinition[] = [
  { type: "selection", label: "Select", shortcut: "V", glyph: NativeSelectionIcon },
  { type: "hand", label: "Hand", shortcut: "H", glyph: NativeHandIcon, nativeAction: "toggleHandTool" },
  { type: "rectangle", label: "Rectangle", shortcut: "R", glyph: NativeRectangleIcon },
  { type: "diamond", label: "Diamond", shortcut: "D", glyph: NativeDiamondIcon },
  { type: "ellipse", label: "Ellipse", shortcut: "O", glyph: NativeEllipseIcon },
  { type: "arrow", label: "Arrow", shortcut: "A", glyph: NativeArrowIcon },
  { type: "line", label: "Line", shortcut: "L", glyph: NativeLineIcon },
  { type: "freedraw", label: "Draw", shortcut: "P", glyph: NativeFreedrawIcon },
  { type: "text", label: "Text", shortcut: "T", glyph: NativeTextIcon },
  { type: "image", label: "Image", shortcut: "I", glyph: NativeImageIcon },
  { type: "eraser", label: "Eraser", shortcut: "E", glyph: NativeEraserIcon, nativeAction: "toggleEraserTool" },
];

const secondaryToolGroups: readonly { label: string; tools: readonly ToolDefinition[] }[] = [
  {
    label: "Select",
    tools: [{ type: "lasso", label: "Lasso select", glyph: NativeLassoIcon, nativeAction: "toggleLassoTool" }],
  },
  {
    label: "Insert",
    tools: [
      { type: "frame", label: "Frame", shortcut: "F", glyph: NativeFrameIcon, nativeAction: "setFrameAsActiveTool" },
      { type: "embeddable", label: "Embed", glyph: NativeEmbedIcon, nativeAction: "setEmbeddableAsActiveTool" },
      { type: "autoshape", label: "Auto shape", glyph: NativeAutoshapeIcon },
      { type: "magicframe", label: "Magic frame", glyph: NativeMagicIcon },
    ],
  },
  {
    label: "Present",
    // Laser is not exposed through Excalidraw's action icon registry in this
    // build. Keep it secondary until its internal icon has a stable adapter.
    tools: [{ type: "laser", label: "Laser pointer", glyph: Zap }],
  },
  {
    label: "Paint",
    tools: [{ type: "bucketfill", label: "Bucket fill", glyph: NativeBucketFillIcon }],
  },
];

const secondaryTools = secondaryToolGroups.flatMap(({ tools }) => tools);

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
  const tools = [...primaryTools, ...secondaryTools];
  return new Set((api ? tools.filter(({ type }) => api.app.isToolSupported(type)) : tools).map(({ type }) => type));
}

function ToolGlyph({ api, tool }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition }) {
  const native = nativeActionIcon(api, tool.nativeAction);
  if (native) return <span className="grid place-items-center [&_svg]:size-4">{native}</span>;
  const Glyph = tool.glyph;
  return <Glyph className={controlGlyphClass} aria-hidden="true" />;
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
      {shortcut && <kbd className="pointer-events-none absolute right-0.5 bottom-0 text-[7px] font-medium leading-none text-muted max-[560px]:hidden">{shortcut}</kbd>}
    </IconButton>
  );
}

function CompactMenuTool({ api, tool, active, onClick }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn("grid size-8 place-items-center rounded-md border border-transparent text-muted transition-colors hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", active && "border-accent/20 bg-tint text-accent")}
      aria-label={tool.label}
      aria-pressed={active}
      title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
      onClick={onClick}
    >
      <ToolGlyph api={api} tool={tool} />
    </button>
  );
}

function MenuAction({ api, nativeAction, label, shortcut, onClick }: { api: ExcalidrawImperativeAPI | null; nativeAction?: string; label: string; shortcut?: string; onClick: () => void }) {
  const icon = nativeActionIcon(api, nativeAction);
  return (
    <button type="button" className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={onClick}>
      {icon && <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <kbd className="rounded border border-line px-1 py-0.5 text-[8px] text-muted group-hover:border-accent group-hover:text-accent">{shortcut}</kbd>}
    </button>
  );
}

function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-1 border-t border-line pt-1 first:border-t-0 first:pt-0" aria-label={label}>
      <h3 className="m-0 px-1.5 pt-1 text-[9px] font-medium text-muted">{label}</h3>
      {children}
    </section>
  );
}

function CanvasBackgroundControl({ backgroundColor, onBackgroundChange }: { backgroundColor: string; onBackgroundChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="group flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[10px] text-ink hover:bg-tint hover:text-accent" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="size-4 shrink-0 rounded border border-line" style={{ backgroundColor }} />
        <span className="min-w-0 flex-1 truncate">Canvas background</span>
      </button>
      {open && (
        <div className="mx-1 rounded-md border border-line bg-canvas/60 p-1.5">
          <div className="grid grid-cols-5 gap-1">
            {canvasBackgroundOptions.map(({ label, color }) => (
              <button key={color} type="button" className={cn("size-7 rounded border border-line hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent", backgroundColor.toLowerCase() === color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} style={{ backgroundColor: color }} aria-label={`${label} background`} onClick={() => onBackgroundChange(color)} />
            ))}
          </div>
          <label className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5 text-[9px] text-muted">
            <span className="min-w-0 flex-1">Custom color</span>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Custom canvas background" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => onBackgroundChange(event.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}

function MoreToolsPanel({ open, anchorRef, api, activeTool, backgroundColor, onBackgroundChange, onAction, onSelectTool, onClose }: {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  backgroundColor: string;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  onSelectTool: (type: ToolbarTool) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useCanvasPanelPosition(anchorRef, panelRef, open, 208, 420);
  useCanvasPanelDismiss(open, panelRef, anchorRef, onClose);
  if (typeof document === "undefined") return null;
  const availableTools = supportedTools(api);
  const run = (name: CanvasActionName) => { onAction(name); onClose(); };

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.98, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, x: -4 }}
          transition={motionTransition}
          className="fixed z-[1000] flex max-h-[calc(100dvh-16px)] w-52 flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? -10000, left: position?.left ?? -10000, visibility: position ? "visible" : "hidden" }}
          aria-label="More canvas tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="border-b border-line px-2.5 py-1.5"><span className="text-[10px] font-medium">More tools</span></header>
          <div className="grid min-h-0 gap-1 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {secondaryToolGroups.map((group) => {
              const tools = group.tools.filter(({ type }) => availableTools.has(type));
              if (!tools.length) return null;
              return (
                <MenuSection key={group.label} label={group.label}>
                  <div className="flex flex-wrap gap-1 px-1 pb-1">
                    {tools.map((tool) => <CompactMenuTool key={tool.type} api={api} tool={tool} active={activeTool === tool.type} onClick={() => { onSelectTool(tool.type); onClose(); }} />)}
                  </div>
                </MenuSection>
              );
            })}
            <MenuSection label="Canvas">
              <CanvasBackgroundControl backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} />
              <MenuAction api={api} nativeAction="clearCanvas" label="Reset canvas" shortcut="⌘⌫" onClick={() => run("clearCanvas")} />
            </MenuSection>
            <MenuSection label="File & export">
              <MenuAction api={api} nativeAction="loadScene" label="Open" shortcut="⌘O" onClick={() => run("loadScene")} />
              <MenuAction api={api} nativeAction="imageExport" label="Export image" shortcut="⇧⌘E" onClick={() => run("imageExport")} />
              <MenuAction api={api} nativeAction="copyAsPng" label="Copy as PNG" onClick={() => run("copyAsPng")} />
              <MenuAction api={api} nativeAction="copyAsSvg" label="Copy as SVG" onClick={() => run("copyAsSvg")} />
              <MenuAction api={api} nativeAction="saveFileToDisk" label="Save to file" shortcut="⌘S" onClick={() => run("saveFileToDisk")} />
            </MenuSection>
            <MenuSection label="Navigate & help">
              <MenuAction api={api} nativeAction="commandPalette" label="Command palette" shortcut="⌘/" onClick={() => run("commandPalette")} />
              <MenuAction api={api} nativeAction="searchMenu" label="Find on canvas" shortcut="⌘F" onClick={() => run("searchMenu")} />
              <MenuAction api={api} nativeAction="toggleShortcuts" label="Help" shortcut="?" onClick={() => run("toggleShortcuts")} />
            </MenuSection>
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
    <motion.div initial={{ opacity: 0, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={motionTransition} className="pointer-events-auto relative flex max-h-[calc(100dvh-16px)] flex-col items-center gap-0.5 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 max-h-[calc(100dvh-104px)] flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryTools.filter(({ type }) => availableTools.has(type)).map((tool) => <ToolButton key={tool.type} icon={<ToolGlyph api={api} tool={tool} />} label={tool.label} shortcut={tool.shortcut} active={activeTool === tool.type} onClick={() => selectTool(tool.type)} />)}
      </div>
      <span className="h-px w-5 shrink-0 bg-line" aria-hidden="true" />
      <div data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={(event) => { if (event.pointerType === "mouse" && !diagramOpen) onDiagramToggle(); }}>
        <ToolButton icon={<Network className={controlGlyphClass} strokeWidth={1.5} />} label="Diagram" active={diagramOpen} onClick={onDiagramToggle} />
        {diagramPanel}
      </div>
      <div ref={panelAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={(event) => { if (event.pointerType === "mouse" && !moreOpen) onMoreToggle(); }}>
        <ToolButton icon={<NativeDotsHorizontalIcon className={controlGlyphClass} />} label="More tools" active={moreOpen} onClick={onMoreToggle} />
        <MoreToolsPanel open={moreOpen} anchorRef={panelAnchorRef} api={api} activeTool={activeTool} backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} onAction={onAction} onSelectTool={selectTool} onClose={() => { if (moreOpen) onMoreToggle(); }} />
      </div>
    </motion.div>
  );
}

function NativeViewAction({ api, name, label, active, mobile = false, onClick }: { api: ExcalidrawImperativeAPI | null; name: string; label: string; active?: boolean; mobile?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  if (!icon) return null;
  return (
    <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0 text-muted hover:text-ink [&_svg]:size-4", !mobile && "max-[560px]:hidden", active && "!bg-tint !text-accent ring-1 ring-accent/15")} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>
      {icon}
    </IconButton>
  );
}

function MobileViewAction({ api, name, label, active, onClick }: { api: ExcalidrawImperativeAPI | null; name: string; label: string; active?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[10px] text-ink hover:bg-tint hover:text-accent", active && "bg-tint text-accent")} aria-pressed={active} onClick={onClick}>{icon && <span className="grid size-4 place-items-center [&_svg]:size-4">{icon}</span>}<span>{label}</span></button>;
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
    <motion.aside initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition} className="pointer-events-auto absolute top-2 right-2 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas view controls" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center rounded-md bg-canvas/70">
        <NativeViewAction api={api} name="zoomOut" label="Zoom out" onClick={() => onAction("zoomOut")} />
        <button type="button" className="h-8 min-w-11 shrink-0 rounded-md px-1.5 text-[9px] font-medium tabular-nums text-ink hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent" aria-label={`Reset zoom from ${zoomLabel} to 100%`} title="Reset zoom" onClick={() => onAction("resetZoom")}>{zoomLabel}</button>
        <NativeViewAction api={api} name="zoomIn" label="Zoom in" onClick={() => onAction("zoomIn")} />
      </div>
      <NativeViewAction api={api} name="zoomToFit" label="Fit canvas" mobile onClick={() => onAction("zoomToFit")} />
      <span className="mx-0.5 h-4 w-px shrink-0 bg-line max-[560px]:hidden" aria-hidden="true" />
      <NativeViewAction api={api} name="undo" label="Undo" onClick={() => onAction("undo")} />
      <NativeViewAction api={api} name="redo" label="Redo" onClick={() => onAction("redo")} />
      <span className="mx-0.5 h-4 w-px shrink-0 bg-line max-[560px]:hidden" aria-hidden="true" />
      <NativeViewAction api={api} name="gridMode" label="Toggle grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
      <NativeViewAction api={api} name="objectsSnapMode" label="Toggle object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
      <IconButton type="button" variant="ghost" className={cn("!size-8 shrink-0 text-muted hover:text-accent max-[560px]:hidden", libraryOpen && "!bg-tint !text-accent ring-1 ring-accent/15")} aria-label="Browse library" aria-pressed={libraryOpen} onClick={toggleLibrary}><NativeLibraryIcon className="size-4" /></IconButton>
      <div ref={mobileMenuRef} className="relative hidden max-[560px]:block">
        <IconButton type="button" variant="ghost" className={cn("!size-8 text-muted hover:text-ink", mobileMoreOpen && "!bg-tint !text-accent")} aria-label="More canvas view controls" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen((open) => !open)}><NativeDotsHorizontalIcon className="size-4" /></IconButton>
        {mobileMoreOpen && (
          <div className="absolute top-[calc(100%+6px)] right-0 z-[120] w-40 rounded-lg border border-line bg-surface p-1 shadow-none" role="menu" aria-label="More canvas view controls">
            <MobileViewAction api={api} name="zoomOut" label="Zoom out" onClick={() => { onAction("zoomOut"); setMobileMoreOpen(false); }} />
            <MobileViewAction api={api} name="zoomIn" label="Zoom in" onClick={() => { onAction("zoomIn"); setMobileMoreOpen(false); }} />
            <div className="my-1 h-px bg-line" />
            <MobileViewAction api={api} name="gridMode" label="Grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
            <MobileViewAction api={api} name="objectsSnapMode" label="Object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
            <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[10px] text-ink hover:bg-tint hover:text-accent", libraryOpen && "bg-tint text-accent")} aria-pressed={libraryOpen} onClick={() => { toggleLibrary(); setMobileMoreOpen(false); }}><NativeLibraryIcon className="size-4" /><span>Library</span></button>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
