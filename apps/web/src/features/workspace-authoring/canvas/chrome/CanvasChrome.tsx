import { Code2, Maximize, Network, Redo2, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ComponentType, ReactNode, Ref, SVGProps } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppState, ExcalidrawImperativeAPI, ToolType } from "@excalidraw/excalidraw/types";
import { IconButton, cn } from "../../../../shared/ui";
import { useAnchoredPanelDismiss, useAnchoredPanelPosition } from "../../../../shared/ui/overlays/anchored-panel";
import { nativeActionIcon } from "../native/CanvasNativeActions";
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
} from "../native/CanvasNativeIcons";
import type { CanvasActionName } from "../native/CanvasToolbar";

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
const controlGlyphClass = "size-5";

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

export function canvasToolName(type: string): string {
  if (type === "freedraw") return "Pen";
  return primaryTools.find((tool) => tool.type === type)?.label ?? secondaryTools.find((tool) => tool.type === type)?.label ?? "Tool";
}

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
  if (native) return <span className="grid place-items-center [&_svg]:size-5">{native}</span>;
  const Glyph = tool.glyph;
  return <Glyph className={controlGlyphClass} aria-hidden="true" />;
}

function ToolButton({ icon, label, shortcut, active, id, toolType, ariaExpanded, ariaControls, onClick }: { icon: ReactNode; label: string; shortcut?: string; active?: boolean; id?: string; toolType?: string; ariaExpanded?: boolean; ariaControls?: string; onClick: () => void }) {
  return (
    <IconButton
      type="button"
      id={id}
      data-canvas-tool={toolType}
      variant="ghost"
      className={cn("relative !size-8 shrink-0 text-ink/70", active ? "!bg-tint !text-accent ring-1 ring-accent/15" : "hover:bg-tint hover:text-accent")}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      {icon}
      {shortcut && <kbd className="pointer-events-none absolute right-0.5 bottom-0 text-[8px] font-semibold leading-none text-ink/60 max-[560px]:hidden">{shortcut}</kbd>}
    </IconButton>
  );
}

function CompactMenuTool({ api, tool, active, buttonRef, onClick }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition; active: boolean; buttonRef?: Ref<HTMLButtonElement>; onClick: () => void }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={cn("flex min-h-8 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-[10px] text-ink/80 transition-colors hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", active && "border-accent/20 bg-tint text-accent")}
      aria-label={tool.label}
      aria-pressed={active}
      title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
      onClick={onClick}
    >
      <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4"><ToolGlyph api={api} tool={tool} /></span>
      <span className="min-w-0 flex-1 truncate">{tool.label}</span>
      {tool.shortcut && <kbd className="text-[8px] text-muted">{tool.shortcut}</kbd>}
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
  const firstToolRef = useRef<HTMLButtonElement>(null);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, open, 176, 144);
  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose, { insideSelector: "[data-canvas-menu-trigger]" });
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => firstToolRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  if (typeof document === "undefined") return null;
  const availableTools = supportedTools(api);
  const groups = secondaryToolGroups
    .map((group) => ({ ...group, tools: group.tools.filter(({ type }) => availableTools.has(type)) }))
    .filter((group) => group.tools.length > 0);

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.98, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, x: -4 }}
          transition={motionTransition}
          id="canvas-more-tools-panel"
          className="fixed z-[1000] w-[min(224px,calc(100vw-16px))] overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? 8, left: position?.left ?? 8, visibility: "visible" }}
          role="dialog"
          aria-label="More canvas tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="px-3 pt-3 pb-2"><span className="text-[10px] font-medium">More tools</span></header>
          <div className="grid max-h-[min(62dvh,420px)] gap-3 overflow-y-auto px-2 pb-2">
            {groups.map((group) => (
              <MenuSection key={group.label} label={group.label}>
                <div className="grid gap-0.5">
                  {group.tools.map((tool) => (
                    <CompactMenuTool key={tool.type} api={api} tool={tool} active={activeTool === tool.type} buttonRef={tool === groups[0]?.tools[0] ? firstToolRef : undefined} onClick={() => { onSelectTool(tool.type); onClose(); }} />
                  ))}
                </div>
              </MenuSection>
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
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Canvas background colors">
        {canvasBackgroundOptions.map(({ label, color }) => (
          <button key={color} type="button" className={cn("size-7 rounded border border-line hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent", backgroundColor.toLowerCase() === color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} style={{ backgroundColor: color }} aria-label={`${label} background`} aria-pressed={backgroundColor.toLowerCase() === color} onClick={() => onBackgroundChange(color)} />
        ))}
      </div>
      <label className="flex items-center gap-2 border-t border-line pt-2 text-[9px] text-muted">
        <span className="min-w-0 flex-1">Custom color</span>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Custom canvas background" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => onBackgroundChange(event.target.value)} />
      </label>
    </div>
  );
}

function ViewMenuAction({ api, name, label, active, onClick }: { api: ExcalidrawImperativeAPI | null; name: string; label: string; active?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", active && "bg-tint text-accent")} aria-pressed={active} onClick={onClick}>{icon && <span className="grid size-4 place-items-center [&_svg]:size-4">{icon}</span>}<span>{label}</span></button>;
}

function CanvasIconAction({ api, nativeAction, label, icon, onClick }: { api: ExcalidrawImperativeAPI | null; nativeAction?: string; label: string; icon: ReactNode; onClick: () => void }) {
  const nativeIcon = nativeActionIcon(api, nativeAction);
  return <IconButton type="button" variant="ghost" className="!size-7 text-ink/70 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" aria-label={label} title={label} onClick={onClick}><span className="grid place-items-center [&_svg]:size-4">{nativeIcon ?? icon}</span></IconButton>;
}

function CanvasCommandMenu({ api, anchorRef, open, backgroundColor, gridModeEnabled, objectsSnapModeEnabled, libraryOpen, onBackgroundChange, onToggleLibrary, onAction, onClose }: {
  api: ExcalidrawImperativeAPI | null;
  anchorRef: { current: HTMLDivElement | null };
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
  const panelRef = useRef<HTMLElement>(null);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, open, 244, 520, { horizontalAlignment: "end" });
  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose);
  const run = (name: CanvasActionName) => { onAction(name); onClose(); };
  if (typeof document === "undefined") return null;

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.985, y: -3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.985, y: -3 }}
          transition={motionTransition}
          id="canvas-command-menu"
          className="fixed z-[1000] grid max-h-[min(72dvh,520px)] w-[min(244px,calc(100vw-16px))] gap-2 overflow-y-auto rounded-lg border border-line bg-surface p-2 text-ink shadow-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0"
          style={{ top: position?.top ?? 8, left: position?.left ?? 8, visibility: position ? "visible" : "hidden" }}
          role="dialog"
          aria-label="Canvas options"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="px-2 pt-1 pb-0.5"><h2 className="m-0 text-[10px] font-medium">Canvas options</h2></header>
          <MenuSection label="View">
            <ViewMenuAction api={api} name="gridMode" label="Grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
            <ViewMenuAction api={api} name="objectsSnapMode" label="Object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
            <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", libraryOpen && "bg-tint text-accent")} aria-pressed={libraryOpen} onClick={() => { onToggleLibrary(); onClose(); }}><NativeLibraryIcon className="size-4" /><span>Library</span></button>
          </MenuSection>
          <MenuSection label="Canvas">
            <div className="grid gap-1 rounded-md border border-line p-1">
              <span className="px-2 pt-1 text-[9px] text-muted">Canvas background</span>
              <BackgroundPalette backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} />
            </div>
            <MenuAction api={api} nativeAction="clearCanvas" label="Reset canvas" shortcut="⌘⌫" onClick={() => run("clearCanvas")} />
          </MenuSection>
          <MenuSection label="File & export">
            <MenuAction api={api} nativeAction="loadScene" label="Open" shortcut="⌘O" onClick={() => run("loadScene")} />
            <MenuAction api={api} nativeAction="saveFileToDisk" label="Save to file" shortcut="⌘S" onClick={() => run("saveFileToDisk")} />
            <MenuAction api={api} nativeAction="imageExport" label="Export image" shortcut="⇧⌘E" onClick={() => run("imageExport")} />
            <MenuAction api={api} nativeAction="copyAsPng" label="Copy as PNG" onClick={() => run("copyAsPng")} />
            <MenuAction api={api} nativeAction="copyAsSvg" label="Copy as SVG" onClick={() => run("copyAsSvg")} />
          </MenuSection>
          <MenuSection label="Navigate & help">
            <MenuAction api={api} nativeAction="searchMenu" label="Find on canvas" shortcut="⌘F" onClick={() => run("searchMenu")} />
            <MenuAction api={api} nativeAction="commandPalette" label="Command palette" shortcut="⌘/" onClick={() => run("commandPalette")} />
            <MenuAction api={api} nativeAction="toggleShortcuts" label="Help" shortcut="?" onClick={() => run("toggleShortcuts")} />
          </MenuSection>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}

export function CanvasToolRail(props: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  diagramAnchorRef: { current: HTMLDivElement | null };
  moreToolsAnchorRef: { current: HTMLDivElement | null };
  diagramOpen: boolean;
  moreOpen: boolean;
  backgroundColor: string;
  onOverlayOpen: () => void;
  onDiagramToggle: () => void;
  onMoreToggle: () => void;
  onCoreToolSelect: () => void;
  onInsertCodeBlock: () => void;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  diagramPanel: ReactNode;
}) {
  const { api, activeTool, diagramAnchorRef, moreToolsAnchorRef, diagramOpen, moreOpen, onOverlayOpen, onDiagramToggle, onMoreToggle, onCoreToolSelect, onInsertCodeBlock, diagramPanel } = props;
  const availableTools = supportedTools(api);
  const activeSecondaryTool = secondaryTools.find(({ type }) => type === activeTool);
  const railRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const revealActiveTool = () => {
      if (getComputedStyle(rail).flexDirection !== "row") return;
      const button = Array.from(rail.querySelectorAll<HTMLElement>("[data-canvas-tool]")).find((element) => element.dataset.canvasTool === activeTool);
      const scroller = button?.parentElement;
      if (!button || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
      const item = button.getBoundingClientRect(), area = scroller.getBoundingClientRect();
      if (item.left < area.left) scroller.scrollLeft += item.left - area.left;
      else if (item.right > area.right) scroller.scrollLeft += item.right - area.right;
    };
    revealActiveTool();
    const observer = new ResizeObserver(revealActiveTool);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [activeTool]);
  const selectTool = (type: ToolbarTool) => {
    if (!api || !availableTools.has(type)) return;
    api.setActiveTool({ type }, { keepSelection: false });
    onCoreToolSelect();
  };

  useEffect(() => {
    const openDiagramFromSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      event.stopPropagation();
      if (!diagramOpen) {
        onDiagramToggle();
        return;
      }
      const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search all Eraser icons"]');
      searchInput?.focus({ preventScroll: true });
      searchInput?.select();
    };
    document.addEventListener("keydown", openDiagramFromSlash, true);
    return () => document.removeEventListener("keydown", openDiagramFromSlash, true);
  }, [diagramOpen, onDiagramToggle]);

  return (
    <motion.div ref={railRef} initial={{ opacity: 1, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={motionTransition} className="pointer-events-auto relative flex flex-col items-center gap-0.5 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryTools.filter(({ type }) => availableTools.has(type)).map((tool) => <ToolButton key={tool.type} toolType={tool.type} icon={<ToolGlyph api={api} tool={tool} />} label={tool.label} shortcut={tool.shortcut} active={activeTool === tool.type} onClick={() => selectTool(tool.type)} />)}
        <ToolButton icon={<Code2 className={controlGlyphClass} strokeWidth={1.5} />} label="Code block" onClick={() => { if (diagramOpen) onDiagramToggle(); onCoreToolSelect(); onInsertCodeBlock(); }} />
      </div>
      <span className="my-0.5 h-px w-5 shrink-0 bg-line" aria-hidden="true" />
      <div ref={diagramAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0">
        <ToolButton icon={<Network className={controlGlyphClass} strokeWidth={1.5} />} label="Diagram" shortcut="/" active={diagramOpen} onClick={() => { if (!diagramOpen) onOverlayOpen(); onDiagramToggle(); }} />
        {diagramPanel}
      </div>
      <div ref={moreToolsAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0">
        <ToolButton
          id="canvas-more-tools-trigger"
          toolType={activeSecondaryTool?.type}
          icon={activeSecondaryTool ? <ToolGlyph api={api} tool={activeSecondaryTool} /> : <NativeDotsHorizontalIcon className={controlGlyphClass} />}
          label={activeSecondaryTool ? `More tools · ${activeSecondaryTool.label}` : "More tools"}
          active={moreOpen || Boolean(activeSecondaryTool)}
          ariaExpanded={moreOpen}
          ariaControls="canvas-more-tools-panel"
          onClick={() => { if (!moreOpen) onOverlayOpen(); onMoreToggle(); }}
        />
        <MoreToolsPanel open={moreOpen} anchorRef={moreToolsAnchorRef} api={api} activeTool={activeTool} onSelectTool={selectTool} onClose={() => { if (moreOpen) onMoreToggle(); }} />
      </div>
    </motion.div>
  );
}

export type CanvasContextualAnchor = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CanvasContextualPosition = { top: number; left: number };

function sameContextualPosition(previous: CanvasContextualPosition | null, next: CanvasContextualPosition | null) {
  return previous?.top === next?.top && previous?.left === next?.left;
}

function clampContextualPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function CanvasBottomChrome({ contextual, tools, contextualAnchor, activeTool, contextualVisible = true }: { contextual: ReactNode; tools: ReactNode; contextualAnchor?: CanvasContextualAnchor | null; activeTool?: string; contextualVisible?: boolean }) {
  const chromeRef = useRef<HTMLDivElement>(null);
  const contextualRef = useRef<HTMLDivElement>(null);
  const [contextualPosition, setContextualPosition] = useState<CanvasContextualPosition | null>(null);
  const anchored = Boolean(contextualAnchor);
  const positionInputs = useRef({ contextualAnchor, activeTool });
  positionInputs.current = { contextualAnchor, activeTool };
  const frameRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    contextualRef.current?.toggleAttribute("inert", !contextualVisible);
  }, [contextualVisible]);

  const updateContextualPosition = useCallback(() => {
    const surface = chromeRef.current?.getBoundingClientRect();
    const toolbar = contextualRef.current;
    const { contextualAnchor: selectionBounds, activeTool: tool } = positionInputs.current;
    const toolButton = Array.from(chromeRef.current?.querySelectorAll<HTMLElement>("[data-canvas-tool]") ?? [])
      .find((button) => button.dataset.canvasTool === tool);
    const anchor = selectionBounds ?? toolButton?.getBoundingClientRect();
    if (!surface || !toolbar || !anchor || toolbar.offsetWidth === 0 || toolbar.offsetHeight === 0) {
      setContextualPosition((previous) => sameContextualPosition(previous, null) ? previous : null);
      return;
    }

    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const surfaceGap = 4;
    const compact = surface.width <= 560;
    const railGutter = selectionBounds && !compact ? 72 : surfaceGap;
    const fullyOutside = anchor.right < surface.left || anchor.left > surface.right || anchor.bottom < surface.top || anchor.top > surface.bottom;
    if (fullyOutside) {
      setContextualPosition((previous) => sameContextualPosition(previous, null) ? previous : null);
      return;
    }

    const minLeft = surface.left + railGutter;
    const maxLeft = surface.right - width - surfaceGap;
    const desiredLeft = selectionBounds || compact ? anchor.left + (anchor.right - anchor.left - width) / 2 : anchor.right + 8;
    const left = clampContextualPosition(desiredLeft, minLeft, maxLeft);
    const aboveAnchor = !selectionBounds && compact ? toolButton?.closest('[aria-label="Canvas tools"]')?.getBoundingClientRect().top ?? anchor.top : anchor.top;
    const desiredTop = !selectionBounds && !compact ? anchor.top + (anchor.bottom - anchor.top - height) / 2 : aboveAnchor - height - surfaceGap;
    const preferredTop = selectionBounds && desiredTop < surface.top + surfaceGap ? anchor.bottom + surfaceGap : desiredTop;
    const top = clampContextualPosition(preferredTop, surface.top + surfaceGap, surface.bottom - height - surfaceGap);
    const next = { top, left };
    setContextualPosition((previous) => sameContextualPosition(previous, next) ? previous : next);
  }, []);

  const schedulePosition = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateContextualPosition();
    });
  }, [updateContextualPosition]);

  useLayoutEffect(() => {
    updateContextualPosition();
    schedulePosition();
  }, [activeTool, contextual, contextualAnchor, schedulePosition, updateContextualPosition]);

  useLayoutEffect(() => {
    const toolbar = contextualRef.current;
    const resizeObserver = toolbar && typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedulePosition) : null;
    if (resizeObserver && toolbar) resizeObserver.observe(toolbar);
    const surface = chromeRef.current;
    if (resizeObserver && surface) resizeObserver.observe(surface);
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("scroll", schedulePosition, true);
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePosition);
      window.removeEventListener("scroll", schedulePosition, true);
    };
  }, [schedulePosition]);

  return (
    <div ref={chromeRef} className="notespace-canvas-chrome pointer-events-none absolute inset-0 z-[90]">
      <div
        ref={contextualRef}
        data-anchored={anchored ? "true" : "false"}
        className="notespace-canvas-contextual-chrome pointer-events-none fixed z-[100] flex max-w-[calc(100vw-16px)] flex-col items-start"
        aria-hidden={!contextualVisible}
        style={{ top: contextualPosition?.top ?? 8, left: contextualPosition?.left ?? 8, visibility: contextualPosition && contextualVisible ? "visible" : "hidden" }}
      >
        {contextual}
      </div>
      <div className="notespace-canvas-tool-dock pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 flex-col items-center">
        {tools}
      </div>
    </div>
  );
}

export function CanvasViewControls({ api, gridModeEnabled, objectsSnapModeEnabled, onAction, onToolOverlayOpen, onOverlayOpen, overlayActive = true, toolOverlayOpen }: {
  api: ExcalidrawImperativeAPI | null;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onAction: (name: CanvasActionName) => void;
  onToolOverlayOpen: () => void;
  onOverlayOpen?: () => void;
  overlayActive?: boolean;
  toolOverlayOpen?: boolean;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const closeCommandMenu = useCallback(() => setCommandMenuOpen(false), []);

  useEffect(() => {
    if (!api) { setLibraryOpen(false); return undefined; }
    const sync = (openSidebar: AppState["openSidebar"]) => setLibraryOpen(openSidebar?.name === "default" && openSidebar.tab === "library");
    sync(api.getAppState().openSidebar);
    setBackgroundColor(api.getAppState().viewBackgroundColor);
    return api.onStateChange("openSidebar", sync);
  }, [api]);

  useEffect(() => {
    if (toolOverlayOpen) closeCommandMenu();
  }, [closeCommandMenu, toolOverlayOpen]);

  useEffect(() => {
    if (!overlayActive) closeCommandMenu();
  }, [closeCommandMenu, overlayActive]);

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
  const runQuickAction = (name: CanvasActionName) => {
    closeCommandMenu();
    onAction(name);
  };

  return (
    <motion.aside initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition} className="pointer-events-auto absolute top-2 right-2 z-20 flex max-w-[calc(100vw-16px)] flex-row items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas view controls" aria-orientation="horizontal" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-px" role="group" aria-label="Canvas zoom controls">
        <CanvasIconAction api={api} nativeAction="zoomToFit" label="Fit canvas" icon={<Maximize />} onClick={() => runQuickAction("zoomToFit")} />
        <CanvasIconAction api={api} nativeAction="resetZoom" label="Reset zoom" icon={<RotateCcw />} onClick={() => runQuickAction("resetZoom")} />
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
        <CanvasIconAction api={api} nativeAction="zoomOut" label="Zoom out" icon={<ZoomOut />} onClick={() => runQuickAction("zoomOut")} />
        <CanvasIconAction api={api} nativeAction="zoomIn" label="Zoom in" icon={<ZoomIn />} onClick={() => runQuickAction("zoomIn")} />
      </div>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
      <div className="flex items-center gap-px" role="group" aria-label="Canvas history controls">
        <CanvasIconAction api={api} nativeAction="undo" label="Undo" icon={<Undo2 />} onClick={() => runQuickAction("undo")} />
        <CanvasIconAction api={api} nativeAction="redo" label="Redo" icon={<Redo2 />} onClick={() => runQuickAction("redo")} />
      </div>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
      <div ref={commandMenuRef} className="relative">
        <IconButton id="canvas-options-trigger" type="button" variant="ghost" className={cn("!size-8 text-ink/70 hover:bg-tint hover:text-accent", commandMenuOpen && "!bg-tint !text-accent ring-1 ring-accent/15")} aria-label="More canvas actions" aria-haspopup="dialog" aria-expanded={commandMenuOpen} aria-controls="canvas-command-menu" title="Canvas options" onClick={() => { if (!commandMenuOpen) { onToolOverlayOpen(); onOverlayOpen?.(); } setCommandMenuOpen((open) => !open); }}><NativeDotsHorizontalIcon className="size-5" /></IconButton>
        <CanvasCommandMenu api={api} anchorRef={commandMenuRef} open={commandMenuOpen} backgroundColor={backgroundColor} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} libraryOpen={libraryOpen} onBackgroundChange={changeBackground} onToggleLibrary={toggleLibrary} onAction={onAction} onClose={closeCommandMenu} />
      </div>
    </motion.aside>
  );
}
