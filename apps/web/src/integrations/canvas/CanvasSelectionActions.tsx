import {
  AlignCenter,
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowRight,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Library,
  LockKeyhole,
  MoreHorizontal,
  Network,
  Pencil,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
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
type SceneElements = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>;
type ActionWithIcon = { icon?: ReactNode | ((appState: AppState, elements: SceneElements) => ReactNode) };

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
const roughnessOptions: readonly { value: number; label: string }[] = [
  { value: 0, label: "Architect" },
  { value: 1, label: "Artist" },
  { value: 2, label: "Cartoonist" },
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
const textAlignOptions: readonly { value: TextAlign; label: string; icon: LucideIcon }[] = [
  { value: "left" as TextAlign, label: "Left", icon: AlignLeft },
  { value: "center" as TextAlign, label: "Center", icon: AlignCenter },
  { value: "right" as TextAlign, label: "Right", icon: AlignRight },
];

function nativeActionIcon(api: ExcalidrawImperativeAPI, name: CanvasRuntimeActionName): ReactNode {
  const action = (api.app.actionManager.actions as unknown as Record<string, ActionWithIcon>)[name];
  const icon = action?.icon;
  if (!icon) return null;
  return typeof icon === "function" ? icon(api.getAppState(), api.getSceneElements()) : icon;
}

function Choice({ label, active, children, onClick }: { label: string; active: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" className={cn("flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-transparent bg-canvas text-ink transition-[color,background-color,border-color,transform] duration-150 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97]", active && "border-accent bg-tint text-accent ring-1 ring-accent/15")} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>{children}</button>;
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return <section className="grid gap-1" aria-label={label}><h3 className="m-0 px-1 text-[9px] font-medium text-muted">{label}</h3>{children}</section>;
}
function CompactButton({ label, open, children, onClick, danger = false }: { label: string; open?: boolean; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" className={cn("grid size-8 shrink-0 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-150 hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96]", open && "bg-tint text-accent ring-1 ring-accent/15", danger && "hover:text-danger")} aria-label={label} aria-expanded={open} title={label} onClick={onClick}>{children}</button>;
}
function SwatchButton({ label, color, open, onClick }: { label: string; color: string; open: boolean; onClick: () => void }) {
  const displayColor = color === "transparent" ? "var(--surface)" : color;
  return <CompactButton label={label} open={open} onClick={onClick}><span className="relative block size-4 rounded-[4px] border border-line" style={{ backgroundColor: displayColor }}>{color === "transparent" && <span className="absolute inset-[2px] rotate-45 border-t border-danger" />}</span></CompactButton>;
}
function FillPreview({ value }: { value: FillStyle }) {
  if (value === "solid") return <span className="block size-4 rounded-[3px] border border-current bg-current" />;
  return <span className="text-[9px] font-medium leading-none">{value === "hachure" ? "///" : "xxx"}</span>;
}

function ActionButton({ api, name, label, fallback: Fallback, disabled, onClick }: { api: ExcalidrawImperativeAPI; name: CanvasRuntimeActionName; label: string; fallback: LucideIcon; disabled?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return (
    <button type="button" className="grid aspect-square w-full place-items-center rounded-md bg-canvas text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 [&_svg]:size-4" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {icon ?? <Fallback size={15} strokeWidth={1.8} />}
    </button>
  );
}

function ActionRow({ api, name, label, fallback: Fallback, disabled, danger, onClick }: { api: ExcalidrawImperativeAPI; name: CanvasRuntimeActionName; label: string; fallback: LucideIcon; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return (
    <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45", danger && "hover:text-danger")} disabled={disabled} onClick={onClick}>
      <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">{icon ?? <Fallback size={14} strokeWidth={1.8} />}</span><span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
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
  const rootRef = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setOpenPanel(null), []);
  useDismissablePopup(rootRef, openPanel !== null, closePanel);

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

  const renderPanel = () => {
    if (!openPanel) return null;
    const panelWidth = openPanel === "more" ? "w-[min(224px,calc(100vw-24px))]" : "w-[min(232px,calc(100vw-24px))]";
    return (
      <motion.div key={openPanel} initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={{ duration: 0.16, ease: "easeOut" }} className={cn("absolute bottom-[calc(100%+8px)] left-1/2 z-[110] max-h-[min(58dvh,440px)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2 text-ink shadow-none min-[561px]:top-0 min-[561px]:bottom-auto min-[561px]:left-[calc(100%+8px)] min-[561px]:translate-x-0", panelWidth)} role="dialog" aria-label={`${openPanel} properties`} onPointerDown={(event) => event.stopPropagation()}>
        {openPanel === "stroke" && <Section label="Stroke color"><label className="flex min-h-9 items-center gap-2 rounded-md bg-canvas px-2 text-[10px] text-muted"><span className="min-w-0 flex-1">Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(strokeColor) ? strokeColor : "#1d1e24"} aria-label="Stroke color" className="size-7 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => updateStyle({ strokeColor: event.target.value })} /></label></Section>}
        {openPanel === "fill" && <Section label="Fill color"><div className="grid gap-1"><label className="flex min-h-9 items-center gap-2 rounded-md bg-canvas px-2 text-[10px] text-muted"><span className="min-w-0 flex-1">Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Fill color" className="size-7 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => updateStyle({ backgroundColor: event.target.value })} /></label>{!bucketFillEditing && <button type="button" className="min-h-8 rounded-md px-2 text-left text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={() => updateStyle({ backgroundColor: "transparent" })}>Transparent</button>}</div></Section>}
        {openPanel === "properties" && <div className="grid gap-2">
          {(shapeEditing || freeDrawEditing || bucketFillEditing) && <Section label="Fill"><div className="grid grid-cols-3 gap-1">{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><FillPreview value={value} /></Choice>)}</div></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing || freeDrawEditing || selectedEditable.some((element) => styleableElementTypes.has(element.type))) && <Section label="Stroke width"><div className="flex gap-1">{strokeWidthOptions.map(({ value, label, width }) => <Choice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><span className="block w-4 rounded-full bg-current" style={{ height: Math.max(1, width / 1.5) }} /></Choice>)}</div></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Stroke style"><div className="flex gap-1">{strokeStyleOptions.map(({ value, label, dash }) => <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><span className={cn("block h-px w-6 border-t-2 border-current", dash && value === "dashed" && "border-dashed", value === "dotted" && "border-dotted")} /></Choice>)}</div></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Sloppiness"><div className="flex gap-1">{roughnessOptions.map(({ value, label }) => <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><span className="text-[10px] font-medium">{value + 1}</span></Choice>)}</div></Section>}
          {!bucketFillEditing && shapeEditing && <Section label="Edges"><div className="grid grid-cols-2 gap-1"><Choice label="Sharp edges" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><span className="block size-4 border-2 border-current" /></Choice><Choice label="Rounded edges" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><span className="block size-4 rounded-[5px] border-2 border-current" /></Choice></div></Section>}
          {!bucketFillEditing && freeDrawEditing && <Section label="Pressure"><div className="grid grid-cols-2 gap-1"><Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}><Pencil size={14} strokeWidth={1.4} /></Choice><Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}><Pencil size={17} strokeWidth={2.2} /></Choice></div></Section>}
          <Section label="Opacity"><div className="flex items-center gap-2 px-1"><input type="range" min="0" max="100" value={opacity} aria-label="Opacity" className="h-1.5 min-w-0 flex-1 accent-accent" onChange={(event) => updateStyle({ opacity: Number(event.target.value) })} /><output className="w-8 text-right text-[9px] tabular-nums text-muted">{Math.round(opacity)}%</output></div></Section>
        </div>}
        {openPanel === "arrow" && selectedArrow && <div className="grid gap-2"><Section label="Arrow type"><div className="grid grid-cols-3 gap-1"><Choice label="Sharp arrow" active={arrowType === "sharp"} onClick={() => updateStyle({ arrowType: "sharp" })}><span className="text-[9px]">Sharp</span></Choice><Choice label="Curved arrow" active={arrowType === "round"} onClick={() => updateStyle({ arrowType: "round" })}><span className="text-[9px]">Curve</span></Choice><Choice label="Elbow arrow" active={arrowType === "elbow"} onClick={() => updateStyle({ arrowType: "elbow" })}><span className="text-[9px]">Elbow</span></Choice></div></Section><Section label="Start arrowhead"><div className="grid grid-cols-5 gap-1">{arrowheadOptions.map(({ value, label, glyph }) => <Choice key={`start-${label}`} label={`Start ${label}`} active={startArrowhead === value} onClick={() => updateStyle({ startArrowhead: value })}><span className="text-[14px] leading-none">{glyph}</span></Choice>)}</div></Section><Section label="End arrowhead"><div className="grid grid-cols-5 gap-1">{arrowheadOptions.map(({ value, label, glyph }) => <Choice key={`end-${label}`} label={`End ${label}`} active={endArrowhead === value} onClick={() => updateStyle({ endArrowhead: value })}><span className="text-[14px] leading-none">{glyph}</span></Choice>)}</div></Section></div>}
        {openPanel === "font" && <Section label="Font family"><div className="grid gap-1">{fontFamilyOptions.map(({ value, label }) => <button key={label} type="button" className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent", fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}><span className="w-6 text-center text-[13px]">Aa</span><span>{label}</span></button>)}</div></Section>}
        {openPanel === "text" && <div className="grid gap-2"><Section label="Font size"><div className="grid grid-cols-4 gap-1">{fontSizeOptions.map((value) => <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[11px] font-medium">{value}</span></Choice>)}</div></Section><Section label="Text align"><div className="grid grid-cols-3 gap-1">{textAlignOptions.map(({ value, label, icon: Icon }) => <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><Icon size={15} /></Choice>)}</div></Section></div>}
        {openPanel === "more" && <div className="grid gap-2">
          <Section label="Layer"><div className="grid grid-cols-4 gap-1"><ActionButton api={api} name="sendToBack" label="Send to back" fallback={Layers} onClick={() => runAndClose("sendToBack")} /><ActionButton api={api} name="sendBackward" label="Send backward" fallback={Layers} onClick={() => runAndClose("sendBackward")} /><ActionButton api={api} name="bringForward" label="Bring forward" fallback={Layers} onClick={() => runAndClose("bringForward")} /><ActionButton api={api} name="bringToFront" label="Bring to front" fallback={Layers} onClick={() => runAndClose("bringToFront")} /></div></Section>
          {selectedElementCount >= 2 && <Section label="Align & distribute"><div className="grid grid-cols-4 gap-1"><ActionButton api={api} name="alignLeft" label="Align left" fallback={AlignHorizontalJustifyStart} onClick={() => runAndClose("alignLeft")} /><ActionButton api={api} name="alignHorizontallyCentered" label="Align center" fallback={AlignHorizontalJustifyCenter} onClick={() => runAndClose("alignHorizontallyCentered")} /><ActionButton api={api} name="alignRight" label="Align right" fallback={AlignHorizontalJustifyEnd} onClick={() => runAndClose("alignRight")} /><ActionButton api={api} name="distributeHorizontally" label="Distribute horizontally" fallback={AlignHorizontalDistributeCenter} disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeHorizontally")} /><ActionButton api={api} name="alignTop" label="Align top" fallback={AlignVerticalJustifyStart} onClick={() => runAndClose("alignTop")} /><ActionButton api={api} name="alignVerticallyCentered" label="Align middle" fallback={AlignVerticalJustifyCenter} onClick={() => runAndClose("alignVerticallyCentered")} /><ActionButton api={api} name="alignBottom" label="Align bottom" fallback={AlignVerticalJustifyEnd} onClick={() => runAndClose("alignBottom")} /><ActionButton api={api} name="distributeVertically" label="Distribute vertically" fallback={AlignVerticalDistributeCenter} disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeVertically")} /></div></Section>}
          <Section label="Group & edit"><div className="grid gap-0.5"><ActionRow api={api} name="group" label="Group" fallback={Network} disabled={selectedElementCount < 2} onClick={() => runAndClose("group")} /><ActionRow api={api} name="ungroup" label="Ungroup" fallback={Network} disabled={!hasSelection} onClick={() => runAndClose("ungroup")} /><ActionRow api={api} name="duplicateSelection" label="Duplicate" fallback={Copy} disabled={!hasSelection} onClick={() => runAndClose("duplicateSelection")} /><ActionRow api={api} name="deleteSelectedElements" label="Delete" fallback={Trash2} danger disabled={!hasSelection} onClick={() => runAndClose("deleteSelectedElements")} /></div></Section>
          <Section label="Transform & reuse"><div className="grid gap-0.5"><ActionRow api={api} name="flipHorizontal" label="Flip horizontally" fallback={FlipHorizontal2} disabled={!hasSelection} onClick={() => runAndClose("flipHorizontal")} /><ActionRow api={api} name="flipVertical" label="Flip vertically" fallback={FlipVertical2} disabled={!hasSelection} onClick={() => runAndClose("flipVertical")} /><ActionRow api={api} name="toggleElementLock" label="Lock or unlock" fallback={LockKeyhole} disabled={!hasSelection} onClick={() => runAndClose("toggleElementLock")} /><ActionRow api={api} name="wrapSelectionInFrame" label="Wrap in frame" fallback={SquareDashed} disabled={!hasSelection} onClick={() => runAndClose("wrapSelectionInFrame")} /><ActionRow api={api} name="addToLibrary" label="Add to library" fallback={Library} disabled={!hasSelection} onClick={() => runAndClose("addToLibrary")} /></div></Section>
        </div>}
      </motion.div>
    );
  };

  return (
    <motion.div ref={rootRef} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="notespace-selection-actions pointer-events-auto absolute bottom-2 left-1/2 z-[90] flex h-11 w-[min(520px,calc(100%-16px))] -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-none min-[561px]:top-1/2 min-[561px]:bottom-auto min-[561px]:left-14 min-[561px]:h-auto min-[561px]:max-h-[calc(100dvh-16px)] min-[561px]:w-11 min-[561px]:translate-x-0 min-[561px]:-translate-y-1/2 min-[561px]:flex-col [&~_.excalidraw_.mobile-shape-actions]:!hidden" role="toolbar" aria-label="Selected shape actions" onPointerDown={(event) => event.stopPropagation()}>
      <AnimatePresence initial={false}>{renderPanel()}</AnimatePresence>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[561px]:w-full min-[561px]:flex-none min-[561px]:flex-col min-[561px]:overflow-x-hidden min-[561px]:overflow-y-auto">
        {showStroke && <SwatchButton label="Stroke color" color={strokeColor} open={openPanel === "stroke"} onClick={() => setOpenPanel((panel) => panel === "stroke" ? null : "stroke")} />}
        {showFill && <SwatchButton label="Fill color" color={backgroundColor} open={openPanel === "fill"} onClick={() => setOpenPanel((panel) => panel === "fill" ? null : "fill")} />}
        {freeDrawEditing && <CompactButton label="Freedraw pressure" onClick={() => updateStyle({ pressure: pressure === "variable" ? "constant" : "variable" })}><Pencil size={16} strokeWidth={pressure === "variable" ? 2.2 : 1.4} /></CompactButton>}
        {shapeProperties && <CompactButton label="Shape properties" open={openPanel === "properties"} onClick={() => setOpenPanel((panel) => panel === "properties" ? null : "properties")}><SlidersHorizontal size={16} strokeWidth={1.8} /></CompactButton>}
        {showArrow && <CompactButton label="Arrow properties" open={openPanel === "arrow"} onClick={() => setOpenPanel((panel) => panel === "arrow" ? null : "arrow")}><ArrowRight size={16} strokeWidth={1.8} /></CompactButton>}
        {showLinearEditor && <CompactButton label="Edit line" onClick={() => onAction("toggleLinearEditor")}><Pencil size={16} strokeWidth={1.8} /></CompactButton>}
        {showText && <><CompactButton label="Font family" open={openPanel === "font"} onClick={() => setOpenPanel((panel) => panel === "font" ? null : "font")}><span className="text-[12px] font-medium leading-none">Aa</span></CompactButton><CompactButton label="Text properties" open={openPanel === "text"} onClick={() => setOpenPanel((panel) => panel === "text" ? null : "text")}><Type size={16} strokeWidth={1.8} /></CompactButton></>}
        <CompactButton label="More selected shape actions" open={openPanel === "more"} onClick={() => setOpenPanel((panel) => panel === "more" ? null : "more")}><MoreHorizontal size={17} strokeWidth={1.8} /></CompactButton>
      </div>
    </motion.div>
  );
}
