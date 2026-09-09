import { Network } from "lucide-react";
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
  NativeLaserIcon,
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

const primaryTools: readonly ToolDefinition[] = [
  { type: "selection", label: "Select", shortcut: "V", glyph: NativeSelectionIcon },
  { type: "hand", label: "Hand", shortcut: "H", glyph: NativeHandIcon },
  { type: "rectangle", label: "Rectangle", shortcut: "R", glyph: NativeRectangleIcon },
  { type: "diamond", label: "Diamond", shortcut: "D", glyph: NativeDiamondIcon },
  { type: "ellipse", label: "Ellipse", shortcut: "O", glyph: NativeEllipseIcon },
  { type: "arrow", label: "Arrow", shortcut: "A", glyph: NativeArrowIcon },
  { type: "line", label: "Line", shortcut: "L", glyph: NativeLineIcon },
  { type: "freedraw", label: "Draw", shortcut: "P", glyph: NativeFreedrawIcon },
  { type: "text", label: "Text", shortcut: "T", glyph: NativeTextIcon },
  { type: "image", label: "Image", shortcut: "I", glyph: NativeImageIcon },
  { type: "eraser", label: "Eraser", shortcut: "E", glyph: NativeEraserIcon },
];

const secondaryToolGroups: readonly { label: string; tools: readonly ToolDefinition[] }[] = [
  {
    label: "Select",
    tools: [{ type: "lasso", label: "Lasso select", glyph: NativeLassoIcon }],
  },
  {
    label: "Insert",
    tools: [
      { type: "frame", label: "Frame", shortcut: "F", glyph: NativeFrameIcon },
      { type: "embeddable", label: "Embed", glyph: NativeEmbedIcon },
      { type: "autoshape", label: "Auto shape", glyph: NativeAutoshapeIcon },
      { type: "magicframe", label: "Magic frame", glyph: NativeMagicIcon },
    ],
  },
  {
    label: "Present",
    tools: [{ type: "laser", label: "Laser pointer", glyph: NativeLaserIcon }],
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
    <button type="button" className="group flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={onClick}>
      {icon && <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <kbd className="rounded border border-line px-1 py-0.5 text-[8px] text-muted group-hover:border-accent group-hover:text-accent">{shortcut}</kbd>}
    </button>
  );
}

function MenuSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0" aria-label={label}>
      <h3 className="m-0 px-2 text-[9px] font-medium text-muted">{label}</h3>
      {children}
    </section>
  );
}

function MoreToolsPanel({ open, anchorRef, api, activeTool, onSelectTool, onClose }: {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  onSelectTool: (type: ToolbarTool) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useCanvasPanelPosition(anchorRef, panelRef, open, 176, 144);
  useCanvasPanelDismiss(open, panelRef, anchorRef, onClose);
  if (typeof document === "undefined") return null;
  const availableTools = supportedTools(api);
  const tools = secondaryTools.filter(({ type }) => availableTools.has(type));

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.98, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, x: -4 }}
          transition={motionTransition}
          className="fixed z-[1000] w-44 overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? -10000, left: position?.left ?? -10000, visibility: position ? "visible" : "hidden" }}
          aria-label="More canvas tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="px-3 pt-3 pb-2"><span className="text-[10px] font-medium">More tools</span></header>
          <div className="grid grid-cols-4 gap-1 px-3 pb-3">
            {tools.map((tool) => (
              <CompactMenuTool key={tool.type} api={api} tool={tool} active={activeTool === tool.type} onClick={() => { onSelectTool(tool.type); onClose(); }} />
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}

function BackgroundPalette({ backgroundColor, onBackgroundChange }: { backgroundColor: string; onBackgroundChange: (color: string) => void }) {
  return (
    <div className="grid gap-2 p-2">
      <div className="grid grid-cols-5 gap-1">
        {canvasBackgroundOptions.map(({ label, color }) => (
          <button key={color} type="button" className={cn("size-7 rounded border border-line hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent", backgroundColor.toLowerCase() === color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} style={{ backgroundColor: color }} aria-label={`${label} background`} onClick={() => onBackgroundChange(color)} />
        ))}
      </div>
      <label className="flex items-center gap-2 border-t border-line pt-2 text-[9px] text-muted">
        <span className="min-w-0 flex-1">Custom color</span>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Custom canvas background" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => onBackgroundChange(event.target.value)} />
      </label>
    </div>
  );
}

function SubmenuTrigger({ label, open, leading, onClick }: { label: string; open: boolean; leading?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", open && "bg-tint text-accent")} aria-expanded={open} onClick={onClick}>
      {leading && <span className="grid size-4 shrink-0 place-items-center">{leading}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span aria-hidden="true" className="text-muted">›</span>
    </button>
  );
}

function MobileViewAction({ api, name, label, active, onClick }: { api: ExcalidrawImperativeAPI | null; name: string; label: string; active?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent", active && "bg-tint text-accent")} aria-pressed={active} onClick={onClick}>{icon && <span className="grid size-4 place-items-center [&_svg]:size-4">{icon}</span>}<span>{label}</span></button>;
}

function CanvasCommandMenu({ api, open, backgroundColor, gridModeEnabled, objectsSnapModeEnabled, libraryOpen, onBackgroundChange, onToggleLibrary, onAction, onClose }: {
  api: ExcalidrawImperativeAPI | null;
  open: boolean;
  backgroundColor: string;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  libraryOpen: boolean;
  onBackgroundChange: (color: string) => void;
  onToggleLibrary: () => void;
  onAction: (name: CanvasActionName) => void;
  onClose: () => void;
}) {
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  if (!open) return null;
  const run = (name: CanvasActionName) => { onAction(name); onClose(); };

  return (
    <div className="absolute top-[calc(100%+6px)] right-0 z-[120] grid w-52 gap-2 rounded-lg border border-line bg-surface p-2 shadow-none" role="menu" aria-label="More canvas view controls">
      <div className="hidden max-[560px]:block">
        <MenuSection label="View">
          <MobileViewAction api={api} name="zoomOut" label="Zoom out" onClick={() => run("zoomOut")} />
          <MobileViewAction api={api} name="zoomIn" label="Zoom in" onClick={() => run("zoomIn")} />
          <MobileViewAction api={api} name="gridMode" label="Grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
          <MobileViewAction api={api} name="objectsSnapMode" label="Object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
          <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent", libraryOpen && "bg-tint text-accent")} aria-pressed={libraryOpen} onClick={onToggleLibrary}><NativeLibraryIcon className="size-4" /><span>Library</span></button>
        </MenuSection>
      </div>
      <MenuSection label="Canvas">
        <div className="relative">
          <SubmenuTrigger label="Canvas background" open={backgroundOpen} leading={<span className="size-4 rounded border border-line" style={{ backgroundColor }} />} onClick={() => { setExportOpen(false); setBackgroundOpen((value) => !value); }} />
          {backgroundOpen && (
            <div className="absolute top-0 right-[calc(100%+6px)] z-10 w-44 rounded-lg border border-line bg-surface shadow-none max-[560px]:top-[calc(100%+4px)] max-[560px]:right-0">
              <BackgroundPalette backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} />
            </div>
          )}
        </div>
        <MenuAction api={api} nativeAction="clearCanvas" label="Reset canvas" shortcut="⌘⌫" onClick={() => run("clearCanvas")} />
      </MenuSection>
      <MenuSection label="File & export">
        <MenuAction api={api} nativeAction="loadScene" label="Open" shortcut="⌘O" onClick={() => run("loadScene")} />
        <MenuAction api={api} nativeAction="saveFileToDisk" label="Save to file" shortcut="⌘S" onClick={() => run("saveFileToDisk")} />
        <div className="relative">
          <SubmenuTrigger label="Export" open={exportOpen} onClick={() => { setBackgroundOpen(false); setExportOpen((value) => !value); }} />
          {exportOpen && (
            <div className="absolute top-0 right-[calc(100%+6px)] z-10 grid w-44 gap-1 rounded-lg border border-line bg-surface p-2 shadow-none max-[560px]:top-[calc(100%+4px)] max-[560px]:right-0">
              <MenuAction api={api} nativeAction="imageExport" label="Export image" shortcut="⇧⌘E" onClick={() => run("imageExport")} />
              <MenuAction api={api} nativeAction="copyAsPng" label="Copy as PNG" onClick={() => run("copyAsPng")} />
              <MenuAction api={api} nativeAction="copyAsSvg" label="Copy as SVG" onClick={() => run("copyAsSvg")} />
            </div>
          )}
        </div>
      </MenuSection>
      <MenuSection label="Navigate & help">
        <MenuAction api={api} nativeAction="searchMenu" label="Find on canvas" shortcut="⌘F" onClick={() => run("searchMenu")} />
        <MenuAction api={api} nativeAction="commandPalette" label="Command palette" shortcut="⌘/" onClick={() => run("commandPalette")} />
        <MenuAction api={api} nativeAction="toggleShortcuts" label="Help" shortcut="?" onClick={() => run("toggleShortcuts")} />
      </MenuSection>
    </div>
  );
}

export function CanvasToolRail(props: {
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
  const { api, activeTool, panelAnchorRef, diagramOpen, moreOpen, onDiagramToggle, onMoreToggle, onCoreToolSelect, diagramPanel } = props;
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
        <MoreToolsPanel open={moreOpen} anchorRef={panelAnchorRef} api={api} activeTool={activeTool} onSelectTool={selectTool} onClose={() => { if (moreOpen) onMoreToggle(); }} />
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

export function CanvasViewControls({ api, zoom, gridModeEnabled, objectsSnapModeEnabled, onAction }: {
  api: ExcalidrawImperativeAPI | null;
  zoom: number;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onAction: (name: CanvasActionName) => void;
}) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const commandMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api) { setLibraryOpen(false); return undefined; }
    const sync = (openSidebar: AppState["openSidebar"]) => setLibraryOpen(openSidebar?.name === "default" && openSidebar.tab === "library");
    sync(api.getAppState().openSidebar);
    setBackgroundColor(api.getAppState().viewBackgroundColor);
    return api.onStateChange("openSidebar", sync);
  }, [api]);

  useEffect(() => {
    if (!commandMenuOpen) return undefined;
    const dismiss = (event: PointerEvent) => {
      if (commandMenuRef.current?.contains(event.target as Node)) return;
      setCommandMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [commandMenuOpen]);

  const toggleLibrary = () => {
    if (!api) return;
    const openSidebar = api.getAppState().openSidebar;
    const isOpen = openSidebar?.name === "default" && openSidebar.tab === "library";
    api.toggleSidebar({ name: "default", tab: "library", force: !isOpen });
  };

  const changeBackground = (color: string) => {
    if (!api) return;
    setBackgroundColor(color);
    api.updateScene({ appState: { viewBackgroundColor: color } });
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
      <div ref={commandMenuRef} className="relative">
        <IconButton type="button" variant="ghost" className={cn("!size-8 text-muted hover:text-ink", commandMenuOpen && "!bg-tint !text-accent")} aria-label="More canvas view controls" aria-expanded={commandMenuOpen} onClick={() => setCommandMenuOpen((open) => !open)}><NativeDotsHorizontalIcon className="size-4" /></IconButton>
        <CanvasCommandMenu api={api} open={commandMenuOpen} backgroundColor={backgroundColor} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} libraryOpen={libraryOpen} onBackgroundChange={changeBackground} onToggleLibrary={toggleLibrary} onAction={onAction} onClose={() => setCommandMenuOpen(false)} />
      </div>
    </motion.aside>
  );
}
