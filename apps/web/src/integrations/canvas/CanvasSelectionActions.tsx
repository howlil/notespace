import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Library,
  LockKeyhole,
  Network,
  SquareDashed,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CaptureUpdateAction, FONT_FAMILY, ROUNDNESS, getStrokeWidthByKey, newElementWith } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  Arrowhead,
  ExcalidrawElement,
  FillStyle,
  FontFamilyValues,
  StrokeStyle,
  StrokeVariability,
  TextAlign,
} from "@excalidraw/excalidraw/element/types";
import { cn } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";
import type { CanvasActionName } from "./CanvasToolbar";

export type CanvasRuntimeActionName = CanvasActionName | "toggleLinearEditor";

type Panel = "stroke" | "fill" | "properties" | "arrow" | "font" | "text" | "more";
type StrokeWidthKey = "thin" | "medium" | "bold";
type ArrowType = "sharp" | "round" | "elbow";

type StylePatch = {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: FillStyle;
  strokeWidth?: StrokeWidthKey;
  strokeStyle?: StrokeStyle;
  roughness?: number;
  roundness?: "round" | "sharp";
  pressure?: StrokeVariability;
  opacity?: number;
  startArrowhead?: Arrowhead | null;
  endArrowhead?: Arrowhead | null;
  fontFamily?: FontFamilyValues;
  fontSize?: number;
  textAlign?: TextAlign;
  arrowType?: ArrowType;
};

const styleableElementTypes = new Set<ExcalidrawElement["type"]>(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw"]);
const inactiveTools = new Set<AppState["activeTool"]["type"]>(["selection", "eraser", "hand", "laser", "lasso"]);

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
const fillStyleOptions: readonly { value: FillStyle; label: string }[] = [
  { value: "hachure", label: "Hachure" },
  { value: "cross-hatch", label: "Cross hatch" },
  { value: "solid", label: "Solid" },
];
const fontSizeOptions = [16, 20, 28, 36] as const;
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
const textAlignOptions: readonly { value: TextAlign; label: string }[] = [
  { value: "left" as TextAlign, label: "Left" },
  { value: "center" as TextAlign, label: "Center" },
  { value: "right" as TextAlign, label: "Right" },
];

function NativeIconFrame({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

function AdjustmentsIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M4 6h8" /><circle cx="14" cy="6" r="2" /><path d="M16 6h4M4 12h2" /><circle cx="8" cy="12" r="2" /><path d="M10 12h10M4 18h11" /><circle cx="17" cy="18" r="2" /><path d="M19 18h1" /></g></NativeIconFrame>;
}
function DotsHorizontalIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></g></NativeIconFrame>;
}
function TextSizeIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M3 7V5h13v2M9.5 5v14M6 19h7M16 12h5M18.5 9.5V19" /></g></NativeIconFrame>;
}
function PencilIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="m4 20 4.5-1 10-10a2 2 0 0 0-3-3l-10 10L4 20Z" /><path d="m14.5 7.5 2 2" /></g></NativeIconFrame>;
}
function SharpArrowIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M4 17 18 7" /><path d="m12 7 6 0 0 6" /></g></NativeIconFrame>;
}
function RoundArrowIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M4 17c6 0 7-10 14-10" /><path d="m12 7 6 0 0 6" /></g></NativeIconFrame>;
}
function ElbowArrowIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M4 17h8V7h6" /><path d="m14 3 4 4-4 4" /></g></NativeIconFrame>;
}
function UndoIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M9 7 5 11l4 4" /><path d="M5 11h8a6 6 0 0 1 6 6" /></g></NativeIconFrame>;
}
function RedoIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="m15 7 4 4-4 4" /><path d="M19 11h-8a6 6 0 0 0-6 6" /></g></NativeIconFrame>;
}
function DuplicateIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></g></NativeIconFrame>;
}
function DeleteIcon() {
  return <NativeIconFrame><g strokeWidth="1.5"><path d="M5 7h14M10 11v5M14 11v5M7 7l1 13h8l1-13M9 7V4h6v3" /></g></NativeIconFrame>;
}
function PressureIcon({ variable }: { variable: boolean }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true"><path d="M3 13c3-5 5 5 9 0s6 5 9 0" strokeWidth={variable ? 2.5 : 1.25} /></svg>;
}
function TextAlignGlyph({ value }: { value: TextAlign }) {
  const x = value === "left" ? 4 : value === "center" ? 6 : 8;
  const widths = value === "center" ? [12, 8, 12] : [12, 9, 12];
  return <svg viewBox="0 0 20 20" width="16" height="16" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">{widths.map((width, index) => <path key={index} d={`M${value === "right" ? 16 - width : value === "center" ? 10 - width / 2 : x} ${5 + index * 5}h${width}`} />)}</svg>;
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

function Choice({ label, active, children, onClick }: { label: string; active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={cn("flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-transparent bg-canvas text-ink transition-[color,background-color,border-color,transform] duration-150 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]", active && "border-accent bg-tint text-accent ring-1 ring-accent/15")} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>{children}</button>
  );
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return <section className="grid gap-1" aria-label={label}><h3 className="m-0 px-1 text-[9px] font-medium text-ink">{label}</h3>{children}</section>;
}
function ActionRow({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45" disabled={disabled} onClick={onClick}><Icon size={14} strokeWidth={1.8} /><span className="min-w-0 flex-1 truncate">{label}</span></button>;
}
function CompactButton({ label, open, children, onClick, danger = false }: { label: string; open?: boolean; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={cn("grid size-8 shrink-0 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-150 hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96]", open && "bg-tint text-accent ring-1 ring-accent/15", danger && "hover:text-danger")} aria-label={label} aria-expanded={open} title={label} onClick={onClick}>{children}</button>
  );
}
function SwatchButton({ label, color, open, onClick }: { label: string; color: string; open: boolean; onClick: () => void }) {
  const displayColor = color === "transparent" ? "var(--surface)" : color;
  return <CompactButton label={label} open={open} onClick={onClick}><span className="relative block size-4 rounded-[4px] border border-line" style={{ backgroundColor: displayColor }}>{color === "transparent" && <span className="absolute inset-[2px] rotate-45 border-t border-danger" />}</span></CompactButton>;
}

function selectionContext(api: ExcalidrawImperativeAPI | null, activeTool: AppState["activeTool"]["type"]) {
  const appState = api?.getAppState();
  const selectedIds = new Set(Object.entries(appState?.selectedElementIds ?? {}).filter(([, selected]) => selected).map(([id]) => id));
  const selectedElements = api?.getSceneElements().filter((element) => selectedIds.has(element.id) && !element.isDeleted) ?? [];
  const selectedEditable = selectedElements.filter((element) => styleableElementTypes.has(element.type) || element.type === "text");
  const primary = selectedEditable[0] ?? null;
  const single = selectedElements.length === 1 ? selectedElements[0] : null;
  const editingType = single?.type ?? activeTool;
  return {
    appState,
    selectedElements,
    selectedEditable,
    primary,
    selectedArrow: single?.type === "arrow" ? single : null,
    selectedFreeDraw: single?.type === "freedraw" ? single : null,
    selectedText: single?.type === "text" ? single : null,
    shapeEditing: editingType === "rectangle" || editingType === "diamond" || editingType === "ellipse",
    lineEditing: editingType === "line" || editingType === "arrow",
    freeDrawEditing: editingType === "freedraw",
    textEditing: editingType === "text",
    bucketFillEditing: selectedElements.length === 0 && activeTool === "bucketfill",
  };
}

export function CanvasSelectionActions({ api, activeTool, selectedElementCount, onAction }: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  selectedElementCount: number;
  onAction: (name: CanvasRuntimeActionName) => void;
}) {
  const [, refresh] = useState(0);
  const [openPanel, setOpenPanel] = useState<Panel | null>(null);
  const [defaultFontSize, setDefaultFontSize] = useState<number | null>(null);
  const [barWidth, setBarWidth] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setOpenPanel(null), []);
  useDismissablePopup(rootRef, openPanel !== null, closePanel);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const sync = () => setBarWidth(node.getBoundingClientRect().width);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const context = selectionContext(api, activeTool);
  const { appState, selectedElements, selectedEditable, primary, selectedArrow, selectedFreeDraw, selectedText, shapeEditing, lineEditing, freeDrawEditing, textEditing, bucketFillEditing } = context;
  const hasSelection = selectedElementCount > 0;
  const hasStyleContext = selectedEditable.length > 0 || shapeEditing || lineEditing || freeDrawEditing || textEditing || bucketFillEditing;
  const shouldShow = hasSelection || (!inactiveTools.has(activeTool) && hasStyleContext);
  if (!api || !appState || !shouldShow) return null;

  const strokeColor = primary?.strokeColor ?? selectedText?.strokeColor ?? appState.currentItemStrokeColor ?? "#1d1e24";
  const backgroundColor = primary?.backgroundColor ?? appState.currentItemBackgroundColor ?? "transparent";
  const fillStyle = primary?.fillStyle ?? appState.currentItemFillStyle ?? "hachure";
  const strokeWidth = primary ? (primary.strokeWidth <= 1 ? "thin" : primary.strokeWidth <= 2 ? "medium" : "bold") : (appState.currentItemStrokeWidthKey ?? "thin");
  const strokeStyle = primary?.strokeStyle ?? appState.currentItemStrokeStyle ?? "solid";
  const roughness = primary?.roughness ?? appState.currentItemRoughness ?? 0;
  const roundness = primary ? (primary.roundness ? "round" : "sharp") : (appState.currentItemRoundness ?? "sharp");
  const pressure = selectedFreeDraw?.strokeOptions.variability ?? appState.currentItemStrokeVariability ?? "variable";
  const opacity = primary?.opacity ?? selectedText?.opacity ?? appState.currentItemOpacity ?? 100;
  const startArrowhead = selectedArrow?.startArrowhead ?? appState.currentItemStartArrowhead ?? null;
  const endArrowhead = selectedArrow?.endArrowhead ?? appState.currentItemEndArrowhead ?? null;
  const arrowType: ArrowType = selectedArrow?.elbowed ? "elbow" : selectedArrow?.roundness ? "round" : "sharp";
  const fontFamily = selectedText?.fontFamily ?? appState.currentItemFontFamily ?? FONT_FAMILY.Excalifont;
  const fontSize = selectedText?.fontSize ?? defaultFontSize ?? appState.currentItemFontSize ?? 20;
  const textAlign = selectedText?.textAlign ?? appState.currentItemTextAlign ?? "left";

  const updateStyle = (patch: StylePatch) => {
    const currentState = api.getAppState();
    const nextAppState: Partial<Pick<AppState, "currentItemStrokeColor" | "currentItemBackgroundColor" | "currentItemFillStyle" | "currentItemStrokeWidthKey" | "currentItemStrokeStyle" | "currentItemStrokeVariability" | "currentItemRoughness" | "currentItemRoundness" | "currentItemOpacity" | "currentItemStartArrowhead" | "currentItemEndArrowhead" | "currentItemFontFamily" | "currentItemFontSize" | "currentItemTextAlign">> = {};
    const elementPatch: { strokeColor?: string; backgroundColor?: string; fillStyle?: FillStyle; strokeWidth?: number; strokeStyle?: StrokeStyle; roughness?: number; roundness?: ExcalidrawElement["roundness"]; elbowed?: boolean; strokeOptions?: { variability: StrokeVariability; streamline: number }; opacity?: number; startArrowhead?: Arrowhead | null; endArrowhead?: Arrowhead | null; fontFamily?: FontFamilyValues; fontSize?: number; textAlign?: TextAlign } = {};
    if (patch.strokeColor !== undefined) { nextAppState.currentItemStrokeColor = patch.strokeColor; elementPatch.strokeColor = patch.strokeColor; }
    if (patch.backgroundColor !== undefined) { nextAppState.currentItemBackgroundColor = patch.backgroundColor; elementPatch.backgroundColor = patch.backgroundColor; }
    if (patch.fillStyle !== undefined) { nextAppState.currentItemFillStyle = patch.fillStyle; elementPatch.fillStyle = patch.fillStyle; }
    if (patch.strokeWidth !== undefined) { nextAppState.currentItemStrokeWidthKey = patch.strokeWidth; elementPatch.strokeWidth = getStrokeWidthByKey(primary?.type ?? activeTool, patch.strokeWidth); }
    if (patch.strokeStyle !== undefined) { nextAppState.currentItemStrokeStyle = patch.strokeStyle; elementPatch.strokeStyle = patch.strokeStyle; }
    if (patch.roughness !== undefined) { nextAppState.currentItemRoughness = patch.roughness; elementPatch.roughness = patch.roughness; }
    if (patch.roundness !== undefined) { nextAppState.currentItemRoundness = patch.roundness; elementPatch.roundness = patch.roundness === "round" ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null; }
    if (patch.pressure !== undefined) { nextAppState.currentItemStrokeVariability = patch.pressure; if (selectedFreeDraw) elementPatch.strokeOptions = { ...selectedFreeDraw.strokeOptions, variability: patch.pressure }; }
    if (patch.opacity !== undefined) { nextAppState.currentItemOpacity = patch.opacity; elementPatch.opacity = patch.opacity; }
    if (patch.startArrowhead !== undefined) { nextAppState.currentItemStartArrowhead = patch.startArrowhead; elementPatch.startArrowhead = patch.startArrowhead; }
    if (patch.endArrowhead !== undefined) { nextAppState.currentItemEndArrowhead = patch.endArrowhead; elementPatch.endArrowhead = patch.endArrowhead; }
    if (patch.fontFamily !== undefined) { nextAppState.currentItemFontFamily = patch.fontFamily; elementPatch.fontFamily = patch.fontFamily; }
    if (patch.fontSize !== undefined) { nextAppState.currentItemFontSize = patch.fontSize; elementPatch.fontSize = patch.fontSize; if (selectedElements.length === 0) setDefaultFontSize(patch.fontSize); }
    if (patch.textAlign !== undefined) { nextAppState.currentItemTextAlign = patch.textAlign; elementPatch.textAlign = patch.textAlign; }
    if (patch.arrowType !== undefined && selectedArrow) { elementPatch.elbowed = patch.arrowType === "elbow"; elementPatch.roundness = patch.arrowType === "round" ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null; }

    const editableIds = new Set(selectedEditable.map((element) => element.id));
    if (editableIds.size > 0 && Object.keys(elementPatch).length > 0) {
      const elements = api.getSceneElements().map((element) => {
        if (!editableIds.has(element.id)) return element;
        const nextPatch = { ...elementPatch };
        if (element.type !== "arrow") { delete nextPatch.startArrowhead; delete nextPatch.endArrowhead; delete nextPatch.elbowed; }
        if (element.type !== "freedraw") delete nextPatch.strokeOptions;
        if (element.type !== "text") { delete nextPatch.fontFamily; delete nextPatch.fontSize; delete nextPatch.textAlign; }
        if (patch.strokeWidth) nextPatch.strokeWidth = getStrokeWidthByKey(element.type, patch.strokeWidth);
        return newElementWith(element, nextPatch);
      });
      api.updateScene({ elements, appState: { ...currentState, ...nextAppState }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    } else {
      api.updateScene({ appState: { ...currentState, ...nextAppState }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    }
    refresh((value) => value + 1);
  };

  const runAndClose = (name: CanvasRuntimeActionName) => { onAction(name); closePanel(); };
  const shapeProperties = shapeEditing || lineEditing || freeDrawEditing || bucketFillEditing || selectedEditable.length > 0;
  const showStroke = !bucketFillEditing && (shapeProperties || textEditing);
  const showFill = bucketFillEditing || shapeEditing || selectedEditable.some((element) => element.type === "rectangle" || element.type === "diamond" || element.type === "ellipse");
  const showArrow = Boolean(selectedArrow);
  const showText = textEditing;
  const showLinearEditor = Boolean(hasSelection && lineEditing);

  // Excalidraw MobileShapeActions uses 32px actions with 6px gaps and promotes
  // duplicate/delete out of the overflow popover only when the bar has room.
  const minimumWidth = 9 * 32 + 8 * 6;
  const showDeleteOutside = hasSelection && barWidth >= minimumWidth + 38;
  const showDuplicateOutside = hasSelection && barWidth >= minimumWidth + 76;

  const renderPanel = () => {
    if (!openPanel) return null;
    const panelWidth = openPanel === "more" ? "w-[min(208px,calc(100vw-24px))]" : "w-[min(224px,calc(100vw-24px))]";
    return (
      <motion.div key={openPanel} initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={{ duration: 0.16, ease: "easeOut" }} className={cn("absolute bottom-[calc(100%+8px)] left-1/2 z-[110] max-h-[min(58dvh,440px)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2 text-ink shadow-none", panelWidth)} role="dialog" aria-label={`${openPanel} properties`} onPointerDown={(event) => event.stopPropagation()}>
        {openPanel === "stroke" && <Section label="Stroke color"><label className="flex min-h-9 items-center gap-2 rounded-md bg-canvas px-2 text-[10px] text-muted"><span className="min-w-0 flex-1">Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(strokeColor) ? strokeColor : "#1d1e24"} aria-label="Stroke color" className="size-7 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => updateStyle({ strokeColor: event.target.value })} /></label></Section>}
        {openPanel === "fill" && <Section label="Fill color"><div className="grid gap-1"><label className="flex min-h-9 items-center gap-2 rounded-md bg-canvas px-2 text-[10px] text-muted"><span className="min-w-0 flex-1">Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Fill color" className="size-7 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => updateStyle({ backgroundColor: event.target.value })} /></label>{!bucketFillEditing && <button type="button" className="min-h-8 rounded-md px-2 text-left text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={() => updateStyle({ backgroundColor: "transparent" })}>Transparent</button>}</div></Section>}
        {openPanel === "properties" && <div className="grid gap-2">
          {(shapeEditing || freeDrawEditing || bucketFillEditing) && <Section label="Fill"><div className="grid grid-cols-3 gap-1">{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><FillGlyph value={value} /></Choice>)}</div></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing || freeDrawEditing || selectedEditable.some((element) => styleableElementTypes.has(element.type))) && <Section label="Stroke width"><div className="flex gap-1">{strokeWidthOptions.map(({ value, label, width }) => <Choice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><span className="block w-4 rounded-full bg-current" style={{ height: Math.max(1, width / 1.5) }} /></Choice>)}</div></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Stroke style"><div className="flex gap-1">{strokeStyleOptions.map(({ value, label, dash }) => <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true"><path d="M2 6h24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" strokeDasharray={dash} /></svg></Choice>)}</div></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Sloppiness"><div className="flex gap-1">{roughnessOptions.map(({ value, label, path }) => <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><svg width="28" height="16" viewBox="0 0 28 16" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" /></svg></Choice>)}</div></Section>}
          {!bucketFillEditing && shapeEditing && <Section label="Edges"><div className="grid grid-cols-2 gap-1"><Choice label="Sharp edges" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><span className="block size-4 border-2 border-current" /></Choice><Choice label="Rounded edges" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><span className="block size-4 rounded-[5px] border-2 border-current" /></Choice></div></Section>}
          {!bucketFillEditing && freeDrawEditing && <Section label="Pressure"><div className="grid grid-cols-2 gap-1"><Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}><PressureIcon variable={false} /></Choice><Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}><PressureIcon variable /></Choice></div></Section>}
          <Section label="Opacity"><div className="flex items-center gap-2 px-1"><input type="range" min="0" max="100" value={opacity} aria-label="Opacity" className="h-1.5 min-w-0 flex-1 accent-accent" onChange={(event) => updateStyle({ opacity: Number(event.target.value) })} /><output className="w-8 text-right text-[9px] tabular-nums text-muted">{Math.round(opacity)}%</output></div></Section>
        </div>}
        {openPanel === "arrow" && selectedArrow && <div className="grid gap-2"><Section label="Arrow type"><div className="grid grid-cols-3 gap-1"><Choice label="Sharp arrow" active={arrowType === "sharp"} onClick={() => updateStyle({ arrowType: "sharp" })}><SharpArrowIcon /></Choice><Choice label="Curved arrow" active={arrowType === "round"} onClick={() => updateStyle({ arrowType: "round" })}><RoundArrowIcon /></Choice><Choice label="Elbow arrow" active={arrowType === "elbow"} onClick={() => updateStyle({ arrowType: "elbow" })}><ElbowArrowIcon /></Choice></div></Section><Section label="Start arrowhead"><div className="grid grid-cols-5 gap-1">{arrowheadOptions.map(({ value, label, glyph }) => <Choice key={`start-${label}`} label={`Start ${label}`} active={startArrowhead === value} onClick={() => updateStyle({ startArrowhead: value })}><span className="text-[14px] leading-none">{glyph}</span></Choice>)}</div></Section><Section label="End arrowhead"><div className="grid grid-cols-5 gap-1">{arrowheadOptions.map(({ value, label, glyph }) => <Choice key={`end-${label}`} label={`End ${label}`} active={endArrowhead === value} onClick={() => updateStyle({ endArrowhead: value })}><span className="text-[14px] leading-none">{glyph}</span></Choice>)}</div></Section></div>}
        {openPanel === "font" && <Section label="Font family"><div className="grid gap-1">{fontFamilyOptions.map(({ value, label }) => <button key={label} type="button" className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent", fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}><span className="w-6 text-center text-[13px]" style={{ fontFamily: label === "Helvetica" ? "Arial, sans-serif" : undefined }}>Aa</span><span>{label}</span></button>)}</div></Section>}
        {openPanel === "text" && <div className="grid gap-2"><Section label="Font size"><div className="grid grid-cols-4 gap-1">{fontSizeOptions.map((value) => <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[11px] font-medium">{value}</span></Choice>)}</div></Section><Section label="Text align"><div className="grid grid-cols-3 gap-1">{textAlignOptions.map(({ value, label }) => <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><TextAlignGlyph value={value} /></Choice>)}</div></Section></div>}
        {openPanel === "more" && <div className="grid gap-2">
          <Section label="Layers"><div className="grid grid-cols-4 gap-1"><ActionIconButton label="Send to back" onClick={() => runAndClose("sendToBack")}><Layers size={14} /></ActionIconButton><ActionIconButton label="Send backward" onClick={() => runAndClose("sendBackward")}><Layers size={14} /></ActionIconButton><ActionIconButton label="Bring forward" onClick={() => runAndClose("bringForward")}><Layers size={14} /></ActionIconButton><ActionIconButton label="Bring to front" onClick={() => runAndClose("bringToFront")}><Layers size={14} /></ActionIconButton></div></Section>
          {selectedElementCount >= 2 && <Section label="Align"><div className="grid grid-cols-4 gap-1"><ActionIconButton label="Align left" onClick={() => runAndClose("alignLeft")}><AlignHorizontalJustifyStart size={14} /></ActionIconButton><ActionIconButton label="Align center" onClick={() => runAndClose("alignHorizontallyCentered")}><AlignHorizontalJustifyCenter size={14} /></ActionIconButton><ActionIconButton label="Align right" onClick={() => runAndClose("alignRight")}><AlignHorizontalJustifyEnd size={14} /></ActionIconButton><ActionIconButton label="Distribute horizontally" disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeHorizontally")}><AlignHorizontalDistributeCenter size={14} /></ActionIconButton><ActionIconButton label="Align top" onClick={() => runAndClose("alignTop")}><AlignVerticalJustifyStart size={14} /></ActionIconButton><ActionIconButton label="Align middle" onClick={() => runAndClose("alignVerticallyCentered")}><AlignVerticalJustifyCenter size={14} /></ActionIconButton><ActionIconButton label="Align bottom" onClick={() => runAndClose("alignBottom")}><AlignVerticalJustifyEnd size={14} /></ActionIconButton><ActionIconButton label="Distribute vertically" disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeVertically")}><AlignVerticalDistributeCenter size={14} /></ActionIconButton></div></Section>}
          <Section label="Actions"><div className="grid gap-0.5"><ActionRow icon={Network} label="Group" disabled={selectedElementCount < 2} onClick={() => runAndClose("group")} /><ActionRow icon={Network} label="Ungroup" disabled={!hasSelection} onClick={() => runAndClose("ungroup")} />{!showDuplicateOutside && <button type="button" className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent" onClick={() => runAndClose("duplicateSelection")}><DuplicateIcon /><span>Duplicate</span></button>}{!showDeleteOutside && <button type="button" className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-danger" onClick={() => runAndClose("deleteSelectedElements")}><DeleteIcon /><span>Delete</span></button>}</div></Section>
          <Section label="Additional"><div className="grid gap-0.5"><ActionRow icon={FlipHorizontal2} label="Flip horizontally" disabled={!hasSelection} onClick={() => runAndClose("flipHorizontal")} /><ActionRow icon={FlipVertical2} label="Flip vertically" disabled={!hasSelection} onClick={() => runAndClose("flipVertical")} /><ActionRow icon={LockKeyhole} label="Lock or unlock" disabled={!hasSelection} onClick={() => runAndClose("toggleElementLock")} /><ActionRow icon={SquareDashed} label="Wrap in frame" disabled={!hasSelection} onClick={() => runAndClose("wrapSelectionInFrame")} /><ActionRow icon={Library} label="Add to library" disabled={!hasSelection} onClick={() => runAndClose("addToLibrary")} /></div></Section>
        </div>}
      </motion.div>
    );
  };

  return (
    <motion.div ref={rootRef} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="notespace-selection-actions pointer-events-auto absolute bottom-2 left-1/2 z-[90] flex h-11 w-[min(520px,calc(100%-16px))] -translate-x-1/2 items-center gap-1.5 rounded-lg border border-line bg-surface px-1.5 shadow-none [&~_.excalidraw_.mobile-shape-actions]:!hidden" role="toolbar" aria-label="Selected shape actions" onPointerDown={(event) => event.stopPropagation()}>
      <AnimatePresence initial={false}>{renderPanel()}</AnimatePresence>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {showStroke && <SwatchButton label="Stroke color" color={strokeColor} open={openPanel === "stroke"} onClick={() => setOpenPanel((panel) => panel === "stroke" ? null : "stroke")} />}
        {showFill && <SwatchButton label="Fill color" color={backgroundColor} open={openPanel === "fill"} onClick={() => setOpenPanel((panel) => panel === "fill" ? null : "fill")} />}
        {freeDrawEditing && <CompactButton label="Freedraw pressure" onClick={() => updateStyle({ pressure: pressure === "variable" ? "constant" : "variable" })}><PressureIcon variable={pressure === "variable"} /></CompactButton>}
        {shapeProperties && <CompactButton label="Shape properties" open={openPanel === "properties"} onClick={() => setOpenPanel((panel) => panel === "properties" ? null : "properties")}><AdjustmentsIcon /></CompactButton>}
        {showArrow && <CompactButton label="Arrow properties" open={openPanel === "arrow"} onClick={() => setOpenPanel((panel) => panel === "arrow" ? null : "arrow")}>{arrowType === "elbow" ? <ElbowArrowIcon /> : arrowType === "round" ? <RoundArrowIcon /> : <SharpArrowIcon />}</CompactButton>}
        {showLinearEditor && <CompactButton label="Edit line" onClick={() => onAction("toggleLinearEditor")}><PencilIcon /></CompactButton>}
        {showText && <><CompactButton label="Font family" open={openPanel === "font"} onClick={() => setOpenPanel((panel) => panel === "font" ? null : "font")}><span className="text-[13px] font-medium leading-none">Aa</span></CompactButton><CompactButton label="Text properties" open={openPanel === "text"} onClick={() => setOpenPanel((panel) => panel === "text" ? null : "text")}><TextSizeIcon /></CompactButton></>}
        <CompactButton label="More selected shape actions" open={openPanel === "more"} onClick={() => setOpenPanel((panel) => panel === "more" ? null : "more")}><DotsHorizontalIcon /></CompactButton>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <CompactButton label="Undo" onClick={() => onAction("undo")}><UndoIcon /></CompactButton>
        <CompactButton label="Redo" onClick={() => onAction("redo")}><RedoIcon /></CompactButton>
        {showDuplicateOutside && <CompactButton label="Duplicate selection" onClick={() => onAction("duplicateSelection")}><DuplicateIcon /></CompactButton>}
        {showDeleteOutside && <CompactButton label="Delete selected elements" danger onClick={() => onAction("deleteSelectedElements")}><DeleteIcon /></CompactButton>}
      </div>
    </motion.div>
  );
}

function ActionIconButton({ label, children, disabled, onClick }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className="grid size-8 place-items-center rounded-md bg-canvas text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}
