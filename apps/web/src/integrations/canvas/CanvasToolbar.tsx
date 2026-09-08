import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowRight,
  BookOpen,
  Circle,
  Copy,
  Diamond,
  Download,
  Eraser,
  Frame,
  FolderOpen,
  Hand,
  Image,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Library,
  LockKeyhole,
  Lasso,
  LineChart,
  MoreHorizontal,
  MousePointer2,
  Network,
  PaintBucket,
  Paintbrush,
  Pencil,
  Redo2,
  RectangleHorizontal,
  RotateCcw,
  Shapes,
  Search,
  SlidersHorizontal,
  SquareDashed,
  Scan,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  Magnet,
  Trash2,
  Type,
  Undo2,
  Wand2,
  Zap,
  X,
  CircleHelp,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppState, ExcalidrawImperativeAPI, ToolType } from "@excalidraw/excalidraw/types";
import { CaptureUpdateAction, FONT_FAMILY, ROUNDNESS, getStrokeWidthByKey, newElementWith } from "@excalidraw/excalidraw";
import type { Arrowhead, ExcalidrawElement, FillStyle, FontFamilyValues, StrokeStyle, StrokeVariability, TextAlign } from "@excalidraw/excalidraw/element/types";
import { IconButton, cn } from "../../components/ui";
import { useCanvasPanelDismiss, useCanvasPanelPosition } from "./CanvasPanelPosition";

type ToolbarTool = ToolType;

const tools: readonly { type: ToolbarTool; label: string; shortcut?: string; icon: LucideIcon }[] = [
  { type: "selection", label: "Select", shortcut: "V", icon: MousePointer2 },
  { type: "lasso", label: "Lasso select", icon: Lasso },
  { type: "hand", label: "Hand", shortcut: "H", icon: Hand },
  { type: "rectangle", label: "Rectangle", shortcut: "R", icon: SquareDashed },
  { type: "diamond", label: "Diamond", shortcut: "D", icon: Diamond },
  { type: "ellipse", label: "Ellipse", shortcut: "O", icon: Circle },
  { type: "arrow", label: "Arrow", shortcut: "A", icon: ArrowRight },
  { type: "line", label: "Line", shortcut: "L", icon: LineChart },
  { type: "freedraw", label: "Draw", shortcut: "P", icon: Pencil },
  { type: "text", label: "Text", shortcut: "T", icon: Type },
  { type: "image", label: "Image", shortcut: "I", icon: Image },
  { type: "frame", label: "Frame", shortcut: "F", icon: Frame },
  { type: "embeddable", label: "Embed", icon: RectangleHorizontal },
  { type: "autoshape", label: "Auto shape", icon: Shapes },
  { type: "magicframe", label: "Magic frame", icon: Wand2 },
  { type: "laser", label: "Laser pointer", icon: Zap },
  { type: "bucketfill", label: "Bucket fill", icon: PaintBucket },
  { type: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
];

const primaryToolTypes: readonly ToolbarTool[] = [
  "selection",
  "hand",
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "eraser",
];

const moreToolGroups: readonly { label: string; types: readonly ToolbarTool[] }[] = [
  { label: "Selection", types: ["lasso"] },
  { label: "Insert", types: ["frame", "embeddable", "autoshape", "magicframe"] },
  { label: "Review", types: ["laser"] },
  { label: "Utilities", types: ["bucketfill"] },
];

function supportedTools(api: ExcalidrawImperativeAPI | null) {
  return new Set((api ? tools.filter(({ type }) => api.app.isToolSupported(type)) : tools).map(({ type }) => type));
}

const canvasMotionTransition = { duration: 0.16, ease: "easeOut" } as const;

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
  { label: "Night sky", color: "#1b2636" },
  { label: "Forest", color: "#242c28" },
] as const;

type StrokeWidthKey = "thin" | "medium" | "bold";
type StylePatch = {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeWidth?: StrokeWidthKey;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  roundness?: "round" | "sharp";
  arrowType?: "sharp" | "round" | "elbow";
  pressure?: StrokeVariability;
  opacity?: number;
  startArrowhead?: Arrowhead | null;
  endArrowhead?: Arrowhead | null;
  fontFamily?: FontFamilyValues;
  fontSize?: number;
  textAlign?: TextAlign;
};

const strokeWidthOptions: readonly { value: StrokeWidthKey; label: string; width: number }[] = [
  { value: "thin", label: "Thin", width: 1 },
  { value: "medium", label: "Medium", width: 2 },
  { value: "bold", label: "Bold", width: 4 },
];
const strokeStyleOptions: readonly { value: StrokeStyle; label: string; dash?: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed", dash: "5 4" },
  { value: "dotted", label: "Dotted", dash: "1 4" },
];
const roughnessOptions: readonly { value: number; label: string; path: string }[] = [
  { value: 0, label: "Architect", path: "M3 9h18" },
  { value: 1, label: "Artist", path: "M3 10c3-5 5 5 9 0s6 5 9 0" },
  { value: 2, label: "Cartoonist", path: "M3 10c2-4 4 4 6 0s4 4 6 0 4 4 6 0" },
];

const styleableElementTypes = new Set<ExcalidrawElement["type"]>(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw"]);
const fillStyleOptions: readonly { value: FillStyle; label: string }[] = [
  { value: "hachure", label: "Hachure" },
  { value: "cross-hatch", label: "Cross hatch" },
  { value: "solid", label: "Solid" },
];
const pressureOptions: readonly { value: StrokeVariability; label: string; glyph: string }[] = [
  { value: "constant", label: "Constant pressure", glyph: "〰" },
  { value: "variable", label: "Variable pressure", glyph: "〰" },
];
const fontSizeOptions: readonly { value: number; label: string }[] = [
  { value: 16, label: "S" },
  { value: 20, label: "M" },
  { value: 28, label: "L" },
  { value: 36, label: "XL" },
];
const arrowheadOptions: readonly { value: Arrowhead | null; label: string; glyph: string }[] = [
  { value: null, label: "None", glyph: "—" },
  { value: "arrow", label: "Arrow", glyph: "→" },
  { value: "triangle", label: "Triangle", glyph: "▶" },
  { value: "triangle_outline", label: "Open triangle", glyph: "▷" },
  { value: "circle", label: "Circle", glyph: "●" },
  { value: "circle_outline", label: "Open circle", glyph: "○" },
  { value: "diamond", label: "Diamond", glyph: "◆" },
  { value: "diamond_outline", label: "Open diamond", glyph: "◇" },
  { value: "bar", label: "Bar", glyph: "▌" },
];
const fontFamilyOptions: readonly { value: FontFamilyValues; label: string }[] = [
  { value: FONT_FAMILY.Excalifont as FontFamilyValues, label: "Excalifont" },
  { value: FONT_FAMILY.Helvetica as FontFamilyValues, label: "Helvetica" },
  { value: FONT_FAMILY.Cascadia as FontFamilyValues, label: "Cascadia" },
  { value: FONT_FAMILY.Nunito as FontFamilyValues, label: "Nunito" },
  { value: FONT_FAMILY["Lilita One"] as FontFamilyValues, label: "Lilita One" },
  { value: FONT_FAMILY["Comic Shanns"] as FontFamilyValues, label: "Comic Shanns" },
  { value: FONT_FAMILY["Liberation Sans"] as FontFamilyValues, label: "Liberation Sans" },
  { value: FONT_FAMILY.Assistant as FontFamilyValues, label: "Assistant" },
];
const textAlignOptions: readonly { value: TextAlign; label: string; icon: LucideIcon }[] = [
  { value: "left" as TextAlign, label: "Align left", icon: AlignLeft },
  { value: "center" as TextAlign, label: "Align center", icon: AlignCenter },
  { value: "right" as TextAlign, label: "Align right", icon: AlignRight },
];

export type CanvasActionName =
  | "undo"
  | "redo"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "zoomToFit"
  | "duplicateSelection"
  | "deleteSelectedElements"
  | "clearCanvas"
  | "loadScene"
  | "saveFileToDisk"
  | "searchMenu"
  | "toggleShortcuts"
  | "imageExport"
  | "changeViewBackgroundColor"
  | "commandPalette"
  | "gridMode"
  | "objectsSnapMode"
  | "copyAsPng"
  | "copyAsSvg"
  | "group"
  | "ungroup"
  | "bringForward"
  | "sendBackward"
  | "bringToFront"
  | "sendToBack"
  | "alignLeft"
  | "alignHorizontallyCentered"
  | "alignRight"
  | "alignTop"
  | "alignVerticallyCentered"
  | "alignBottom"
  | "distributeHorizontally"
  | "distributeVertically"
  | "flipHorizontal"
  | "flipVertical"
  | "copyStyles"
  | "pasteStyles"
  | "toggleElementLock"
  | "wrapSelectionInFrame"
  | "addToLibrary";

interface CanvasToolbarButtonProps {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  expanded?: boolean;
  onClick: () => void;
}

function CanvasToolbarButton({ icon: Icon, label, shortcut, active = false, expanded, onClick }: CanvasToolbarButtonProps) {
  return (
    <div className="group relative flex shrink-0">
      <IconButton
        type="button"
        variant="ghost"
        className={cn(
          "relative !size-8 shrink-0 text-muted",
          active && "!bg-tint !text-accent ring-1 ring-accent/15",
          !active && "hover:text-ink",
        )}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        aria-pressed={active}
        aria-expanded={expanded}
        onClick={onClick}
      >
        <Icon size={15} strokeWidth={1.8} />
        {shortcut && <kbd className={cn("pointer-events-none absolute right-0.5 bottom-0 text-[7px] font-medium leading-none", active ? "text-accent" : "text-muted")}>{shortcut}</kbd>}
      </IconButton>
    </div>
  );
}

interface DetailsActionProps {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}

function DetailsAction({ icon: Icon, label, shortcut, disabled, onClick }: DetailsActionProps) {
  return (
    <button
      type="button"
      className="group flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink transition-[color,background-color,border-color,opacity,transform] duration-150 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.985] disabled:cursor-default disabled:opacity-45 disabled:active:scale-100"
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
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
      <button type="button" className="group flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent" aria-expanded={open} aria-controls="canvas-background-palette" title="Choose canvas background" onClick={() => setOpen((value) => !value)}>
        <Paintbrush size={14} strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate">Canvas background</span>
        <span className="size-3.5 shrink-0 rounded border border-line" style={{ backgroundColor }} aria-label={`Current background ${backgroundColor}`} />
        <ChevronDown size={12} className={cn("shrink-0 text-muted transition-transform duration-150", open && "rotate-180 text-accent")} />
      </button>
      {open && (
        <div id="canvas-background-palette" className="rounded-md border border-line bg-canvas/60 p-2" aria-label="Canvas background colors">
          <div className="grid grid-cols-6 gap-1.5">
            {canvasBackgroundOptions.map(({ label, color }) => <button key={color} type="button" className={cn("relative size-6 rounded border border-line transition-[transform,box-shadow] duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent", backgroundColor.toLowerCase() === color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} style={{ backgroundColor: color }} aria-label={`${label} background (${color})`} aria-pressed={backgroundColor.toLowerCase() === color} title={label} onClick={() => onBackgroundChange(color)} />)}
          </div>
          <label className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-[9px] text-muted"><span className="min-w-0 flex-1">Custom color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Choose custom canvas background color" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => onBackgroundChange(event.target.value)} /></label>
        </div>
      )}
    </div>
  );
}

function CanvasColorControl({ api }: { api: ExcalidrawImperativeAPI | null }) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const appState = api?.getAppState();
  const selectedIds = new Set(Object.entries(appState?.selectedElementIds ?? {}).filter(([, selected]) => selected).map(([id]) => id));
  const selectedElement = api?.getSceneElements().find((element) => selectedIds.has(element.id) && !element.isDeleted);
  const strokeColor = selectedElement?.strokeColor ?? appState?.currentItemStrokeColor ?? "#1d1e24";
  const backgroundColor = selectedElement?.backgroundColor ?? appState?.currentItemBackgroundColor ?? "transparent";
  useCanvasPanelDismiss(open, panelRef, triggerRef, () => setOpen(false));

  const updateColor = (kind: "strokeColor" | "backgroundColor", color: string) => {
    if (!api) return;
    const elements = api.getSceneElements().map((element) => selectedIds.has(element.id) ? newElementWith(element, { [kind]: color }) : element);
    api.updateScene({ elements, appState: { ...api.getAppState(), [kind === "strokeColor" ? "currentItemStrokeColor" : "currentItemBackgroundColor"]: color }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  return (
    <div ref={triggerRef} className="relative flex shrink-0">
      <IconButton type="button" variant="ghost" className={cn("!size-8", open ? "!bg-tint !text-accent" : "text-muted hover:text-ink")} aria-label="Colors" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="relative block size-4 rounded-[4px] border border-line" style={{ backgroundColor: strokeColor }}><span className="absolute -right-1 -bottom-1 size-2.5 rounded-[3px] border border-surface" style={{ backgroundColor: backgroundColor === "transparent" ? "var(--surface)" : backgroundColor }} /></span>
      </IconButton>
      {open && <div ref={panelRef} className="absolute top-0 left-full z-20 ml-2 w-[176px] rounded-lg border border-line bg-surface p-2 text-ink shadow-[0_12px_32px_#0002]" aria-label="Canvas colors" onPointerDown={(event) => event.stopPropagation()}>
        <label className="flex min-h-8 items-center gap-2 rounded-md px-2 text-[10px] hover:bg-tint"><span className="min-w-0 flex-1">Stroke</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(strokeColor) ? strokeColor : "#1d1e24"} aria-label="Stroke color" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => updateColor("strokeColor", event.target.value)} /></label>
        <label className="flex min-h-8 items-center gap-2 rounded-md px-2 text-[10px] hover:bg-tint"><span className="min-w-0 flex-1">Fill</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Background color" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => updateColor("backgroundColor", event.target.value)} /></label>
        <button type="button" className="mt-1 flex min-h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={() => updateColor("backgroundColor", "transparent")}>× <span>Transparent fill</span></button>
      </div>}
    </div>
  );
}

interface CanvasMorePanelProps {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  api: ExcalidrawImperativeAPI | null;
  selectedElementCount: number;
  backgroundColor: string;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  onSelectTool: (type: ToolbarTool) => void;
  onClose: () => void;
}

function CanvasMorePanel({ open, anchorRef, api, selectedElementCount, backgroundColor, onBackgroundChange, onAction, onSelectTool, onClose }: CanvasMorePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useCanvasPanelPosition(anchorRef, panelRef, open, 208, 420);
  useCanvasPanelDismiss(open, panelRef, anchorRef, onClose);
  if (typeof document === "undefined") return null;

  const availableTools = supportedTools(api);
  const hasSelection = selectedElementCount > 0;
  const runAction = (name: CanvasActionName) => {
    onAction(name);
    onClose();
  };
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
          transition={canvasMotionTransition}
          className="fixed z-[1000] flex max-h-[calc(100dvh-16px)] w-[208px] flex-col overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? -10000, left: position?.left ?? -10000, visibility: position ? "visible" : "hidden", transformOrigin: `${horizontal === "left" ? "right" : "left"} ${vertical === "above" ? "bottom" : "top"}` }}
          aria-label="More canvas tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-2">
            <div className="min-w-0 text-[11px] font-medium">More tools</div>
            <IconButton type="button" aria-label="Close more canvas tools" title="Close" className="!size-6" onClick={onClose}><X size={13} /></IconButton>
          </header>
          <div className="min-h-0 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {moreToolGroups.map(({ label, types }) => {
              const groupTools = tools.filter(({ type }) => types.includes(type) && availableTools.has(type));
              if (groupTools.length === 0) return null;
              return (
                <section key={label} className="mb-2 last:mb-0" aria-label={label}>
                  <div className="grid gap-0.5">
                    {groupTools.map(({ type, label: toolLabel, shortcut, icon }) => (
                      <DetailsAction key={type} icon={icon} label={toolLabel} shortcut={shortcut} onClick={() => onSelectTool(type)} />
                    ))}
                  </div>
                </section>
              );
            })}
            <section className="mt-1 border-t border-line pt-1" aria-label="Canvas settings">
              <CanvasBackgroundControl backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} />
              <DetailsAction icon={RotateCcw} label="Reset canvas" shortcut="⌘⌫" onClick={() => runAction("clearCanvas")} />
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="File actions">
              <DetailsAction icon={FolderOpen} label="Open" shortcut="⌘O" onClick={() => runAction("loadScene")} />
              <DetailsAction icon={Image} label="Export image" shortcut="⇧⌘E" onClick={() => runAction("imageExport")} />
              <DetailsAction icon={Copy} label="Copy as PNG" onClick={() => runAction("copyAsPng")} />
              <DetailsAction icon={Copy} label="Copy as SVG" onClick={() => runAction("copyAsSvg")} />
              <DetailsAction icon={Download} label="Save to file" shortcut="⌘S" onClick={() => runAction("saveFileToDisk")} />
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="Selection actions">
              <DetailsAction icon={Copy} label="Duplicate" shortcut="⌘D" disabled={!hasSelection} onClick={() => runAction("duplicateSelection")} />
              <DetailsAction icon={Trash2} label="Delete" shortcut="⌫" disabled={!hasSelection} onClick={() => runAction("deleteSelectedElements")} />
              <DetailsAction icon={Network} label="Group" shortcut="⌘G" disabled={selectedElementCount < 2} onClick={() => runAction("group")} />
              <DetailsAction icon={Network} label="Ungroup" shortcut="⇧⌘G" disabled={!hasSelection} onClick={() => runAction("ungroup")} />
              <DetailsAction icon={SquareDashed} label="Wrap in frame" disabled={!hasSelection} onClick={() => runAction("wrapSelectionInFrame")} />
              <DetailsAction icon={Library} label="Add to library" disabled={!hasSelection} onClick={() => runAction("addToLibrary")} />
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="Arrange actions">
              <DetailsAction icon={Layers} label="Bring to front" disabled={!hasSelection} onClick={() => runAction("bringToFront")} />
              <DetailsAction icon={Layers} label="Bring forward" disabled={!hasSelection} onClick={() => runAction("bringForward")} />
              <DetailsAction icon={Layers} label="Send backward" disabled={!hasSelection} onClick={() => runAction("sendBackward")} />
              <DetailsAction icon={Layers} label="Send to back" disabled={!hasSelection} onClick={() => runAction("sendToBack")} />
              <DetailsAction icon={LockKeyhole} label="Lock or unlock" disabled={!hasSelection} onClick={() => runAction("toggleElementLock")} />
              <DetailsAction icon={AlignHorizontalJustifyStart} label="Align left" disabled={selectedElementCount < 2} onClick={() => runAction("alignLeft")} />
              <DetailsAction icon={AlignHorizontalJustifyCenter} label="Align center" disabled={selectedElementCount < 2} onClick={() => runAction("alignHorizontallyCentered")} />
              <DetailsAction icon={AlignHorizontalJustifyEnd} label="Align right" disabled={selectedElementCount < 2} onClick={() => runAction("alignRight")} />
              <DetailsAction icon={AlignVerticalJustifyStart} label="Align top" disabled={selectedElementCount < 2} onClick={() => runAction("alignTop")} />
              <DetailsAction icon={AlignVerticalJustifyCenter} label="Align middle" disabled={selectedElementCount < 2} onClick={() => runAction("alignVerticallyCentered")} />
              <DetailsAction icon={AlignVerticalJustifyEnd} label="Align bottom" disabled={selectedElementCount < 2} onClick={() => runAction("alignBottom")} />
              <DetailsAction icon={AlignHorizontalDistributeCenter} label="Distribute horizontally" disabled={selectedElementCount < 3} onClick={() => runAction("distributeHorizontally")} />
              <DetailsAction icon={AlignVerticalDistributeCenter} label="Distribute vertically" disabled={selectedElementCount < 3} onClick={() => runAction("distributeVertically")} />
              <DetailsAction icon={FlipHorizontal2} label="Flip horizontally" disabled={!hasSelection} onClick={() => runAction("flipHorizontal")} />
              <DetailsAction icon={FlipVertical2} label="Flip vertically" disabled={!hasSelection} onClick={() => runAction("flipVertical")} />
              <DetailsAction icon={Copy} label="Copy styles" disabled={!hasSelection} onClick={() => runAction("copyStyles")} />
              <DetailsAction icon={Copy} label="Paste styles" disabled={!hasSelection} onClick={() => runAction("pasteStyles")} />
            </section>
            <section className="mt-1 border-t border-line pt-1" aria-label="Navigation actions">
              <DetailsAction icon={Zap} label="Command palette" shortcut="⌘/" onClick={() => runAction("commandPalette")} />
              <DetailsAction icon={Search} label="Find on canvas" shortcut="⌘F" onClick={() => runAction("searchMenu")} />
              <DetailsAction icon={CircleHelp} label="Help" shortcut="?" onClick={() => runAction("toggleShortcuts")} />
            </section>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}

function StyleChoice({ label, active, children, onClick }: { label: string; active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-transparent bg-canvas text-ink transition-[color,background-color,border-color,transform] duration-150 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]",
        active && "border-accent bg-tint text-accent ring-1 ring-accent/15",
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StyleSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-1" aria-label={label || undefined}>
      {label && <h3 className="m-0 px-1 text-[9px] font-medium text-ink">{label}</h3>}
      {children}
    </section>
  );
}

function FillGlyph({ value }: { value: FillStyle }) {
  if (value === "solid") return <span className="block size-4 rounded-[3px] border border-current bg-current" />;
  const crossHatch = value === "cross-hatch";
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true" className="rounded-[3px] border border-current">
      <path d="M-2 15 15-2M2 19 19 2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      {crossHatch && <path d="M-2 2 15 19M2-2 19 15" fill="none" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}

function getCanvasStyleContext(api: ExcalidrawImperativeAPI | null, activeTool: AppState["activeTool"]["type"]) {
  const appState = api?.getAppState();
  const selectedIds = new Set(Object.entries(appState?.selectedElementIds ?? {}).filter(([, selected]) => selected).map(([id]) => id));
  const selectedElements = api?.getSceneElements().filter((element) => selectedIds.has(element.id) && !element.isDeleted) ?? [];
  const editingType = selectedElements.length === 1 ? selectedElements[0].type : activeTool;

  return {
    appState,
    selectedElements,
    selectedElement: selectedElements.length === 1 && styleableElementTypes.has(selectedElements[0].type) ? selectedElements[0] : null,
    selectedArrow: selectedElements.length === 1 && selectedElements[0].type === "arrow" ? selectedElements[0] : null,
    selectedFreeDraw: selectedElements.length === 1 && selectedElements[0].type === "freedraw" ? selectedElements[0] : null,
    selectedText: selectedElements.length === 1 && selectedElements[0].type === "text" ? selectedElements[0] : null,
    shapeEditing: editingType === "rectangle" || editingType === "diamond" || editingType === "ellipse",
    lineEditing: editingType === "line" || editingType === "arrow",
    textEditing: editingType === "text",
    freeDrawEditing: editingType === "freedraw",
  };
}

function CanvasStylePanel({ api, activeTool }: { api: ExcalidrawImperativeAPI | null; activeTool: AppState["activeTool"]["type"] }) {
  const [, refresh] = useState(0);
  const [defaultFontSize, setDefaultFontSize] = useState<number | null>(null);
  const { appState, selectedElements, selectedElement, selectedArrow, selectedFreeDraw, selectedText, shapeEditing, lineEditing, textEditing, freeDrawEditing } = getCanvasStyleContext(api, activeTool);
  const arrowEditing = Boolean(selectedArrow);
  const fillStyle = selectedElement?.fillStyle ?? appState?.currentItemFillStyle ?? "hachure";
  const strokeWidth = selectedElement
    ? (selectedElement.strokeWidth <= 1 ? "thin" : selectedElement.strokeWidth <= 2 ? "medium" : "bold")
    : (appState?.currentItemStrokeWidthKey ?? "thin");
  const strokeStyle = selectedElement?.strokeStyle ?? appState?.currentItemStrokeStyle ?? "solid";
  const roughness = selectedElement?.roughness ?? appState?.currentItemRoughness ?? 0;
  const roundness = selectedElement ? (selectedElement.roundness ? "round" : "sharp") : (appState?.currentItemRoundness ?? "sharp");
  const pressure = selectedFreeDraw
    ? selectedFreeDraw.strokeOptions.variability
    : (appState?.currentItemStrokeVariability ?? "variable");
  const opacity = selectedElement?.opacity ?? selectedText?.opacity ?? appState?.currentItemOpacity ?? 100;
  const startArrowhead = selectedArrow?.startArrowhead ?? appState?.currentItemStartArrowhead ?? null;
  const endArrowhead = selectedArrow?.endArrowhead ?? appState?.currentItemEndArrowhead ?? null;
  const fontFamily = selectedText?.fontFamily ?? appState?.currentItemFontFamily ?? FONT_FAMILY.Excalifont;
  const fontSize = selectedText?.fontSize ?? defaultFontSize ?? appState?.currentItemFontSize ?? 20;
  const textAlign = selectedText?.textAlign ?? appState?.currentItemTextAlign ?? "left";
  const arrowType = selectedArrow?.elbowed ? "elbow" : selectedArrow?.roundness ? "round" : "sharp";
  const [arrowheadMenu, setArrowheadMenu] = useState<"start" | "end" | null>(null);
  const [arrowheadMoreOpen, setArrowheadMoreOpen] = useState(false);
  const [textMoreOpen, setTextMoreOpen] = useState(false);

  const updateStyle = (patch: StylePatch) => {
    if (!api) return;
    const nextAppState: Partial<Pick<AppState, "currentItemStrokeColor" | "currentItemBackgroundColor" | "currentItemFillStyle" | "currentItemStrokeWidthKey" | "currentItemStrokeStyle" | "currentItemStrokeVariability" | "currentItemRoughness" | "currentItemRoundness" | "currentItemOpacity" | "currentItemStartArrowhead" | "currentItemEndArrowhead" | "currentItemFontFamily" | "currentItemFontSize" | "currentItemTextAlign">> = {};
    const elementPatch: { strokeColor?: string; backgroundColor?: string; fillStyle?: FillStyle; strokeWidth?: number; strokeStyle?: StrokeStyle; roughness?: number; roundness?: ExcalidrawElement["roundness"]; elbowed?: boolean; strokeOptions?: { variability: StrokeVariability; streamline: number }; opacity?: number; startArrowhead?: Arrowhead | null; endArrowhead?: Arrowhead | null; fontFamily?: FontFamilyValues; fontSize?: number; textAlign?: TextAlign } = {};
    if (patch.strokeColor !== undefined) {
      nextAppState.currentItemStrokeColor = patch.strokeColor;
      if (selectedElement || selectedText) elementPatch.strokeColor = patch.strokeColor;
    }
    if (patch.backgroundColor !== undefined) {
      nextAppState.currentItemBackgroundColor = patch.backgroundColor;
      if (selectedElement) elementPatch.backgroundColor = patch.backgroundColor;
    }
    if (patch.fillStyle !== undefined) {
      nextAppState.currentItemFillStyle = patch.fillStyle;
      if (selectedElement) elementPatch.fillStyle = patch.fillStyle;
    }
    if (patch.strokeWidth !== undefined) {
      nextAppState.currentItemStrokeWidthKey = patch.strokeWidth;
      if (selectedElement) elementPatch.strokeWidth = getStrokeWidthByKey(selectedElement.type, patch.strokeWidth);
    }
    if (patch.strokeStyle !== undefined) {
      nextAppState.currentItemStrokeStyle = patch.strokeStyle;
      if (selectedElement) elementPatch.strokeStyle = patch.strokeStyle;
    }
    if (patch.roughness !== undefined) {
      nextAppState.currentItemRoughness = patch.roughness;
      if (selectedElement) elementPatch.roughness = patch.roughness;
    }
    if (patch.roundness !== undefined) {
      nextAppState.currentItemRoundness = patch.roundness;
      if (selectedElement) elementPatch.roundness = patch.roundness === "round" ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null;
    }
    if (patch.arrowType !== undefined && selectedArrow) {
      elementPatch.elbowed = patch.arrowType === "elbow";
      elementPatch.roundness = patch.arrowType === "round" ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null;
    }
    if (patch.pressure !== undefined) {
      nextAppState.currentItemStrokeVariability = patch.pressure;
      if (selectedElement?.type === "freedraw") elementPatch.strokeOptions = { ...selectedElement.strokeOptions, variability: patch.pressure };
    }
    if (patch.opacity !== undefined) {
      nextAppState.currentItemOpacity = patch.opacity;
      if (selectedElement || selectedText) elementPatch.opacity = patch.opacity;
    }
    if (patch.startArrowhead !== undefined) {
      nextAppState.currentItemStartArrowhead = patch.startArrowhead;
      if (selectedArrow) elementPatch.startArrowhead = patch.startArrowhead;
    }
    if (patch.endArrowhead !== undefined) {
      nextAppState.currentItemEndArrowhead = patch.endArrowhead;
      if (selectedArrow) elementPatch.endArrowhead = patch.endArrowhead;
    }
    if (patch.fontFamily !== undefined) {
      nextAppState.currentItemFontFamily = patch.fontFamily;
      if (selectedText) elementPatch.fontFamily = patch.fontFamily;
    }
    if (patch.fontSize !== undefined) {
      nextAppState.currentItemFontSize = patch.fontSize;
      if (selectedText) elementPatch.fontSize = patch.fontSize;
      if (selectedElements.length === 0) setDefaultFontSize(patch.fontSize);
    }
    if (patch.textAlign !== undefined) {
      nextAppState.currentItemTextAlign = patch.textAlign;
      if (selectedText) elementPatch.textAlign = patch.textAlign;
    }
    const selectedEditableIds = new Set(selectedElements.filter((element) => styleableElementTypes.has(element.type) || element.type === "text").map((element) => element.id));
    if (selectedEditableIds.size > 0 && Object.keys(elementPatch).length > 0) {
      const elements = api.getSceneElements().map((element) => {
        if (!selectedEditableIds.has(element.id)) return element;
        const nextElementPatch = { ...elementPatch };
        if (element.type !== "arrow") {
          delete nextElementPatch.startArrowhead;
          delete nextElementPatch.endArrowhead;
        }
        if (element.type !== "freedraw") delete nextElementPatch.strokeOptions;
        if (element.type !== "arrow") delete nextElementPatch.elbowed;
        if (element.type !== "text") {
          delete nextElementPatch.fontFamily;
          delete nextElementPatch.fontSize;
          delete nextElementPatch.textAlign;
        }
        if (patch.strokeWidth) nextElementPatch.strokeWidth = getStrokeWidthByKey(element.type, patch.strokeWidth);
        return newElementWith(element, nextElementPatch);
      });
      api.updateScene({ elements, appState: { ...api.getAppState(), ...nextAppState }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    } else {
      api.updateScene({ appState: { ...api.getAppState(), ...nextAppState }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    }
    refresh((value) => value + 1);
  };

  return (
    <div className="grid gap-2 p-1.5">
      {shapeEditing && (
        <StyleSection label="Fill">
          <div className="grid grid-cols-3 gap-1">
            {fillStyleOptions.map(({ value, label }) => <StyleChoice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><FillGlyph value={value} /></StyleChoice>)}
          </div>
        </StyleSection>
      )}
      {lineEditing && arrowEditing && (
        <StyleSection label="Arrowheads">
          <div className="relative grid grid-cols-2 gap-1">
            {(["start", "end"] as const).map((side) => {
              const value = side === "start" ? startArrowhead : endArrowhead;
              const option = arrowheadOptions.find(({ value: candidate }) => candidate === value) ?? arrowheadOptions[0];
              return (
                <StyleChoice key={side} label={`${side} arrowhead`} active={arrowheadMenu === side} onClick={() => { setArrowheadMenu((current) => current === side ? null : side); setArrowheadMoreOpen(false); }}>
                  <span className="flex items-center gap-1 text-[14px] leading-none"><span className="text-[8px] text-muted">{side === "start" ? "←" : "→"}</span>{option.glyph}</span>
                </StyleChoice>
              );
            })}
            {arrowheadMenu && (
              <div className="absolute top-0 left-full z-20 ml-2 w-[208px] rounded-md border border-line bg-surface p-2 shadow-[0_12px_32px_#0002]" aria-label={`${arrowheadMenu} arrowhead options`}>
                <div className="grid grid-cols-4 gap-1">
                  {arrowheadOptions.slice(0, 4).map(({ value: option, label, glyph }) => <StyleChoice key={label} label={`${arrowheadMenu} ${label}`} active={(arrowheadMenu === "start" ? startArrowhead : endArrowhead) === option} onClick={() => { updateStyle({ [arrowheadMenu === "start" ? "startArrowhead" : "endArrowhead"]: option }); setArrowheadMenu(null); }}><span className="text-[15px] leading-none">{glyph}</span></StyleChoice>)}
                </div>
                <button type="button" className="mt-1 flex min-h-7 w-full items-center justify-between rounded px-1 text-left text-[10px] text-ink hover:bg-tint hover:text-accent" onClick={() => setArrowheadMoreOpen((open) => !open)}>More options <ChevronDown size={12} className={cn("transition-transform", arrowheadMoreOpen && "rotate-180")} /></button>
                {arrowheadMoreOpen && <>
                  <div className="grid grid-cols-4 gap-1 border-t border-line pt-1">
                    {arrowheadOptions.slice(4).map(({ value: option, label, glyph }) => <StyleChoice key={label} label={`${arrowheadMenu} ${label}`} active={(arrowheadMenu === "start" ? startArrowhead : endArrowhead) === option} onClick={() => { updateStyle({ [arrowheadMenu === "start" ? "startArrowhead" : "endArrowhead"]: option }); setArrowheadMenu(null); }}><span className="text-[15px] leading-none">{glyph}</span></StyleChoice>)}
                  </div>
                  <div className="mt-1 border-t border-line pt-1" aria-label="Cardinality">
                    <div className="mb-1 px-1 text-[9px] text-ink">Cardinality</div>
                    <div className="grid grid-cols-4 gap-1">
                      {(["cardinality_one", "cardinality_many", "cardinality_one_or_many", "cardinality_exactly_one", "cardinality_zero_or_one", "cardinality_zero_or_many"] as const).map((option) => <StyleChoice key={option} label={option.replaceAll("_", " ")} active={(arrowheadMenu === "start" ? startArrowhead : endArrowhead) === option} onClick={() => { updateStyle({ [arrowheadMenu === "start" ? "startArrowhead" : "endArrowhead"]: option }); setArrowheadMenu(null); }}><span className="text-[12px] leading-none">{option === "cardinality_many" ? "●" : option === "cardinality_one" ? "—" : option === "cardinality_one_or_many" ? "◇" : option === "cardinality_exactly_one" ? "⊣" : option === "cardinality_zero_or_one" ? "○" : "◇"}</span></StyleChoice>)}
                    </div>
                  </div>
                </>}
              </div>
            )}
          </div>
        </StyleSection>
      )}
      {lineEditing && arrowEditing && (
        <StyleSection label="Arrow type">
          <div className="grid grid-cols-3 gap-1">
            <StyleChoice label="Sharp arrow" active={arrowType === "sharp"} onClick={() => updateStyle({ arrowType: "sharp" })}><span className="text-[15px]">→</span></StyleChoice>
            <StyleChoice label="Curved arrow" active={arrowType === "round"} onClick={() => updateStyle({ arrowType: "round" })}><span className="text-[15px]">↝</span></StyleChoice>
            <StyleChoice label="Elbow arrow" active={arrowType === "elbow"} onClick={() => updateStyle({ arrowType: "elbow" })}><span className="text-[15px]">⌞</span></StyleChoice>
          </div>
        </StyleSection>
      )}
      {(lineEditing || shapeEditing || freeDrawEditing) && (
        <StyleSection label="Stroke width">
          <div className="flex gap-1">
            {strokeWidthOptions.map(({ value, label, width }) => <StyleChoice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><span className="block h-0.5 w-4 rounded-full bg-current" style={{ height: Math.max(1, width / 1.5) }} /></StyleChoice>)}
          </div>
        </StyleSection>
      )}
      {(lineEditing || shapeEditing) && <StyleSection label="Stroke style"><div className="flex gap-1">{strokeStyleOptions.map(({ value, label, dash }) => <StyleChoice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true"><path d="M2 6h24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" strokeDasharray={dash} /></svg></StyleChoice>)}</div></StyleSection>}
      {(lineEditing || shapeEditing) && <StyleSection label="Sloppiness"><div className="flex gap-1">{roughnessOptions.map(({ value, label, path }) => <StyleChoice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" /></svg></StyleChoice>)}</div></StyleSection>}
      {shapeEditing && <StyleSection label="Edges"><div className="flex gap-1"><StyleChoice label="Sharp edges" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><span className="block size-4 border-2 border-current" /></StyleChoice><StyleChoice label="Rounded edges" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><span className="block size-4 rounded-[5px] border-2 border-current" /></StyleChoice></div></StyleSection>}
      {freeDrawEditing && <StyleSection label="Fill"><div className="grid grid-cols-3 gap-1">{fillStyleOptions.map(({ value, label }) => <StyleChoice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><FillGlyph value={value} /></StyleChoice>)}</div></StyleSection>}
      {freeDrawEditing && <StyleSection label="Pressure"><div className="flex gap-1">{pressureOptions.map(({ value, label, glyph }) => <StyleChoice key={value} label={label} active={pressure === value} onClick={() => updateStyle({ pressure: value })}><span className="text-[16px] leading-none">{glyph}</span></StyleChoice>)}</div></StyleSection>}
      {textEditing && <>
        <StyleSection label="Font size"><div className="grid grid-cols-4 gap-1">{fontSizeOptions.map(({ value, label }) => <StyleChoice key={label} label={`Font size ${label}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[17px] leading-none">{label}</span></StyleChoice>)}</div></StyleSection>
        <StyleSection label="Text align"><div className="grid grid-cols-3 gap-1">{textAlignOptions.map(({ value, label, icon: Icon }) => <StyleChoice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><Icon size={14} /></StyleChoice>)}</div></StyleSection>
        <button type="button" className="flex min-h-7 items-center justify-between rounded px-1 text-left text-[9px] text-muted hover:bg-tint hover:text-accent" onClick={() => setTextMoreOpen((open) => !open)}>More text options <ChevronDown size={12} className={cn("transition-transform", textMoreOpen && "rotate-180")} /></button>
        {textMoreOpen && <label className="flex h-8 items-center gap-2 rounded-md bg-canvas px-2 text-[9px] text-muted"><span className="min-w-0 flex-1">Font family</span><select value={fontFamily} aria-label="Font family" className="max-w-[120px] min-w-0 bg-transparent text-right text-[10px] text-ink outline-none" onChange={(event) => updateStyle({ fontFamily: Number(event.target.value) as FontFamilyValues })}>{fontFamilyOptions.map(({ value, label }) => <option key={label} value={value}>{label}</option>)}</select></label>}
      </>}
      {(lineEditing || shapeEditing || freeDrawEditing || textEditing) && <StyleSection label="Opacity"><div className="flex items-center gap-2 px-1"><input type="range" min="0" max="100" value={opacity} aria-label="Opacity" className="h-1.5 min-w-0 flex-1 accent-accent" onChange={(event) => updateStyle({ opacity: Number(event.target.value) })} /><output className="w-7 text-right text-[9px] tabular-nums text-muted">{Math.round(opacity)}%</output></div></StyleSection>}
    </div>
  );
}

interface CanvasDetailsPanelProps {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  onClose: () => void;
}

export function CanvasDetailsPanel({ open, anchorRef, api, activeTool, onClose }: CanvasDetailsPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useCanvasPanelPosition(anchorRef, panelRef, open, 228, 560);
  useCanvasPanelDismiss(open, panelRef, anchorRef, onClose);
  const { shapeEditing, lineEditing, textEditing, freeDrawEditing } = getCanvasStyleContext(api, activeTool);
  if (typeof document === "undefined" || !(shapeEditing || lineEditing || textEditing || freeDrawEditing)) return null;

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
          transition={canvasMotionTransition}
          className="fixed z-[1000] flex max-h-[calc(100dvh-16px)] w-[min(228px,calc(100vw-88px))] min-w-0 flex-col overflow-visible rounded-lg border border-line bg-surface text-ink shadow-[0_12px_32px_#0002]"
          style={{ top: position?.top ?? -10000, left: position?.left ?? -10000, visibility: position ? "visible" : "hidden", transformOrigin: `${horizontal === "left" ? "right" : "left"} ${vertical === "above" ? "bottom" : "top"}` }}
          aria-label="Canvas details"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="grid gap-1 p-1.5">
            <CanvasStylePanel api={api} activeTool={activeTool} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}

interface CanvasUtilityBarProps {
  api: ExcalidrawImperativeAPI | null;
  zoom: number;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onAction: (name: CanvasActionName) => void;
}

export function CanvasUtilityBar({ api, zoom, gridModeEnabled, objectsSnapModeEnabled, onAction }: CanvasUtilityBarProps) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    if (!api) {
      setLibraryOpen(false);
      return undefined;
    }

    const syncLibraryState = (openSidebar: AppState["openSidebar"]) => {
      setLibraryOpen(openSidebar?.name === "default" && openSidebar.tab === "library");
    };

    syncLibraryState(api.getAppState().openSidebar);
    return api.onStateChange("openSidebar", syncLibraryState);
  }, [api]);

  const toggleLibrary = () => {
    if (!api) return;
    const openSidebar = api.getAppState().openSidebar;
    const isLibraryOpen = openSidebar?.name === "default" && openSidebar.tab === "library";
    api.toggleSidebar({ name: "default", tab: "library", force: !isLibraryOpen });
  };

  return (
    <motion.aside initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={canvasMotionTransition} className="pointer-events-auto absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas view controls" onPointerDown={(event) => event.stopPropagation()}>
      <IconButton type="button" variant="ghost" className="!size-8 text-muted hover:text-ink" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)" onClick={() => onAction("undo")}><Undo2 size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className="!size-8 text-muted hover:text-ink" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" onClick={() => onAction("redo")}><Redo2 size={15} strokeWidth={1.8} /></IconButton>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <IconButton type="button" variant="ghost" className="!size-8 text-muted hover:text-ink" aria-label="Zoom out" title="Zoom out (-)" onClick={() => onAction("zoomOut")}><ZoomOut size={15} strokeWidth={1.8} /></IconButton>
      <button type="button" className="min-w-11 rounded-md px-1.5 py-1.5 text-[10px] font-medium tabular-nums text-muted transition-[color,background-color,transform] duration-150 hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]" aria-label={`Reset zoom to ${zoomLabel}`} title="Reset zoom (0)" onClick={() => onAction("resetZoom")}>{zoomLabel}</button>
      <IconButton type="button" variant="ghost" className="!size-8 text-muted hover:text-ink" aria-label="Zoom in" title="Zoom in (+)" onClick={() => onAction("zoomIn")}><ZoomIn size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className="!size-8 text-muted hover:text-ink" aria-label="Fit canvas" title="Fit canvas (Shift+1)" onClick={() => onAction("zoomToFit")}><Scan size={15} strokeWidth={1.8} /></IconButton>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <IconButton type="button" variant="ghost" className={cn("!size-8", gridModeEnabled ? "!bg-tint !text-accent ring-1 ring-accent/15" : "text-muted hover:text-accent")} aria-label="Toggle grid" title="Toggle grid" aria-pressed={gridModeEnabled} onClick={() => onAction("gridMode")}><Grid3X3 size={15} strokeWidth={1.8} /></IconButton>
      <IconButton type="button" variant="ghost" className={cn("!size-8", objectsSnapModeEnabled ? "!bg-tint !text-accent ring-1 ring-accent/15" : "text-muted hover:text-accent")} aria-label="Toggle object snapping" title="Toggle object snapping" aria-pressed={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")}><Magnet size={15} strokeWidth={1.8} /></IconButton>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
      <IconButton
        type="button"
        variant="ghost"
        className={cn("!size-8", libraryOpen ? "!bg-accent !text-white ring-1 ring-accent/25" : "text-muted hover:text-accent")}
        aria-label="Browse library"
        title="Browse Excalidraw library"
        aria-pressed={libraryOpen}
        onClick={toggleLibrary}
      >
        <BookOpen size={15} strokeWidth={1.8} />
      </IconButton>
    </motion.aside>
  );
}

interface Props {
  api: ExcalidrawImperativeAPI | null;
  panelAnchorRef: { current: HTMLDivElement | null };
  activeTool: AppState["activeTool"]["type"];
  selectedElementCount: number;
  backgroundColor: string;
  onBackgroundChange: (color: string) => void;
  diagramOpen: boolean;
  detailsOpen: boolean;
  moreOpen: boolean;
  onDiagramToggle: () => void;
  onDetailsToggle: () => void;
  onMoreToggle: () => void;
  onCoreToolSelect: () => void;
  onAction: (name: CanvasActionName) => void;
  diagramPanel: ReactNode;
  detailsPanel: ReactNode;
}

export function CanvasToolbar({ api, panelAnchorRef, activeTool, selectedElementCount, backgroundColor, onBackgroundChange, diagramOpen, detailsOpen, moreOpen, onDiagramToggle, onDetailsToggle, onMoreToggle, onCoreToolSelect, onAction, diagramPanel, detailsPanel }: Props) {
  const availableTools = supportedTools(api);
  const visibleTools = tools.filter(({ type }) => primaryToolTypes.includes(type) && availableTools.has(type));
  const openDiagram = () => { if (!diagramOpen) onDiagramToggle(); };
  const openDetails = () => { if (!detailsOpen) onDetailsToggle(); };
  const openMore = () => { if (!moreOpen) onMoreToggle(); };

  return (
    <motion.div initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={canvasMotionTransition} className="pointer-events-auto relative flex max-h-[calc(100dvh-16px)] flex-col items-center gap-1 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 max-h-[calc(100dvh-116px)] flex-col items-center gap-0.5 overflow-y-auto overflow-x-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleTools.map(({ type, label, shortcut, icon: Icon }) => (
          <CanvasToolbarButton key={type} icon={Icon} label={label} shortcut={shortcut} active={activeTool === type} onClick={() => { api?.setActiveTool({ type }, { keepSelection: true }); onCoreToolSelect(); }} />
        ))}
      </div>
      <CanvasColorControl api={api} />
      <span className="h-px w-5 shrink-0 bg-line" aria-hidden="true" />
      <div data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={openDiagram} onFocusCapture={openDiagram}>
        <CanvasToolbarButton icon={Network} label="Diagram" active={diagramOpen} expanded={diagramOpen} onClick={onDiagramToggle} />
        {diagramPanel}
      </div>
      <div data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={openDetails} onFocusCapture={openDetails}>
        <CanvasToolbarButton icon={SlidersHorizontal} label="Canvas details" active={detailsOpen} expanded={detailsOpen} onClick={onDetailsToggle} />
        {detailsPanel}
      </div>
      <div ref={panelAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0" onPointerEnter={openMore} onFocusCapture={openMore}>
        <CanvasToolbarButton icon={MoreHorizontal} label="More tools" active={moreOpen} expanded={moreOpen} onClick={onMoreToggle} />
        <CanvasMorePanel anchorRef={panelAnchorRef} open={moreOpen} api={api} selectedElementCount={selectedElementCount} backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} onAction={onAction} onSelectTool={(type) => { api?.setActiveTool({ type }, { keepSelection: true }); onMoreToggle(); }} onClose={onMoreToggle} />
      </div>
    </motion.div>
  );
}
