import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  Library,
  LockKeyhole,
  Network,
  SquareDashed,
  Trash2,
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
import {
  NativeAdjustmentsIcon,
  NativeArrowheadIcon,
  NativeArrowTypeIcon,
  NativeDotsHorizontalIcon,
  NativeEdgeIcon,
  NativeFillIcon,
  NativePencilIcon,
  NativePressureIcon,
  NativeSloppinessIcon,
  NativeStrokeStyleIcon,
  NativeStrokeWidthIcon,
  NativeTextAlignIcon,
  NativeTextSizeIcon,
} from "./CanvasNativeIcons";
import type { CanvasActionName } from "./CanvasToolbar";

export type CanvasRuntimeActionName = CanvasActionName | "toggleLinearEditor";

type Panel = "stroke" | "fill" | "properties" | "arrow" | "font" | "text" | "more";
type StrokeWidthKey = "thin" | "medium" | "bold";
type ArrowType = "sharp" | "round" | "elbow";
type SceneElements = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>;
type ActionWithIcon = { icon?: ReactNode | ((appState: AppState, elements: SceneElements) => ReactNode) };
type ActionManagerAdapter = {
  actions: Record<string, ActionWithIcon>;
  executeAction: (action: unknown, source: "ui", value?: unknown) => void;
};

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

const strokeWidthOptions: readonly { value: StrokeWidthKey; label: string }[] = [
  { value: "thin", label: "Thin" },
  { value: "medium", label: "Medium" },
  { value: "bold", label: "Bold" },
];
const strokeStyleOptions: readonly { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
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
const arrowheadOptions: readonly { value: Arrowhead | null; label: string }[] = [
  { value: null, label: "None" },
  { value: "arrow", label: "Arrow" },
  { value: "triangle", label: "Triangle" },
  { value: "triangle_outline", label: "Triangle outline" },
  { value: "circle", label: "Circle" },
  { value: "circle_outline", label: "Circle outline" },
  { value: "diamond", label: "Diamond" },
  { value: "diamond_outline", label: "Diamond outline" },
  { value: "bar", label: "Bar" },
];
const textAlignOptions: readonly { value: TextAlign; label: string }[] = [
  { value: "left" as TextAlign, label: "Left" },
  { value: "center" as TextAlign, label: "Center" },
  { value: "right" as TextAlign, label: "Right" },
];

function actionManager(api: ExcalidrawImperativeAPI): ActionManagerAdapter {
  return api.app.actionManager as unknown as ActionManagerAdapter;
}

function nativeActionIcon(api: ExcalidrawImperativeAPI, name: string): ReactNode {
  const action = actionManager(api).actions[name];
  const icon = action?.icon;
  if (!icon) return null;
  return typeof icon === "function" ? icon(api.getAppState(), api.getSceneElements()) : icon;
}

function executeNativeAction(api: ExcalidrawImperativeAPI, name: string, value?: unknown) {
  const manager = actionManager(api);
  const action = manager.actions[name];
  if (!action) return false;
  manager.executeAction(action, "ui", value);
  return true;
}

function Choice({ label, active, children, onClick }: { label: string; active: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" className={cn("grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-canvas text-ink transition-[color,background-color,border-color,transform] duration-150 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] min-[561px]:size-10 [&_svg]:size-4 min-[561px]:[&_svg]:size-5", active && "border-accent bg-tint text-accent ring-1 ring-accent/15")} aria-label={label} aria-pressed={active} title={label} onClick={onClick}>{children}</button>;
}
function Section({ label, children }: { label: string; children: ReactNode }) {
  return <section className="grid gap-1.5" aria-label={label}><h3 className="m-0 px-1 text-[9px] font-medium text-muted">{label}</h3>{children}</section>;
}
function ChoiceRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1">{children}</div>;
}
function CompactButton({ label, open, children, onClick, danger = false }: { label: string; open?: boolean; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button type="button" className={cn("grid size-8 shrink-0 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-150 hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96] min-[561px]:size-10 [&_svg]:size-4 min-[561px]:[&_svg]:size-5", open && "bg-tint text-accent ring-1 ring-accent/15", danger && "hover:text-danger")} aria-label={label} aria-expanded={open} title={label} onClick={onClick}>{children}</button>;
}
function SwatchButton({ label, color, open, onClick }: { label: string; color: string; open: boolean; onClick: () => void }) {
  const displayColor = color === "transparent" ? "var(--surface)" : color;
  return <CompactButton label={label} open={open} onClick={onClick}><span className="relative block size-4 rounded-[4px] border border-line min-[561px]:size-5" style={{ backgroundColor: displayColor }}>{color === "transparent" && <span className="absolute inset-[2px] rotate-45 border-t border-danger" />}</span></CompactButton>;
}

function ActionButton({ api, name, label, fallback: Fallback, disabled, onClick }: { api: ExcalidrawImperativeAPI; name: CanvasRuntimeActionName; label: string; fallback: LucideIcon; disabled?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return (
    <button type="button" className="grid size-10 place-items-center rounded-md bg-canvas text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 [&_svg]:size-5" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {icon ?? <Fallback size={20} strokeWidth={1.5} />}
    </button>
  );
}

function ActionRow({ api, name, label, fallback: Fallback, disabled, danger, onClick }: { api: ExcalidrawImperativeAPI; name: CanvasRuntimeActionName; label: string; fallback: LucideIcon; disabled?: boolean; danger?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return (
    <button type="button" className={cn("flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-45", danger && "hover:text-danger")} disabled={disabled} onClick={onClick}>
      <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">{icon ?? <Fallback size={16} strokeWidth={1.5} />}</span><span className="min-w-0 flex-1 truncate">{label}</span>
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

  const updateArrowType = (value: ArrowType) => {
    if (!executeNativeAction(api, "changeArrowType", value)) updateStyle({ arrowType: value });
    refresh((current) => current + 1);
  };
  const updateArrowhead = (position: "start" | "end", value: Arrowhead | null) => {
    if (!executeNativeAction(api, "changeArrowhead", { position, type: value })) {
      updateStyle(position === "start" ? { startArrowhead: value } : { endArrowhead: value });
    }
    refresh((current) => current + 1);
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
    const panelWidth = openPanel === "more" ? "w-[min(224px,calc(100vw-24px))]" : "w-[min(264px,calc(100vw-24px))]";
    return (
      <motion.div key={openPanel} initial={{ opacity: 0, y: 4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={{ duration: 0.16, ease: "easeOut" }} className={cn("absolute bottom-[calc(100%+8px)] left-1/2 z-[110] max-h-[min(58dvh,440px)] -translate-x-1/2 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-2 text-ink shadow-none min-[561px]:top-0 min-[561px]:bottom-auto min-[561px]:left-[calc(100%+8px)] min-[561px]:translate-x-0", panelWidth)} role="dialog" aria-label={`${openPanel} properties`} onPointerDown={(event) => event.stopPropagation()}>
        {openPanel === "stroke" && <Section label="Stroke color"><label className="flex min-h-9 items-center gap-2 rounded-md bg-canvas px-2 text-[10px] text-muted"><span className="min-w-0 flex-1">Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(strokeColor) ? strokeColor : "#1d1e24"} aria-label="Stroke color" className="size-7 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => updateStyle({ strokeColor: event.target.value })} /></label></Section>}
        {openPanel === "fill" && <Section label="Fill color"><div className="grid gap-1"><label className="flex min-h-9 items-center gap-2 rounded-md bg-canvas px-2 text-[10px] text-muted"><span className="min-w-0 flex-1">Color</span><input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Fill color" className="size-7 cursor-pointer rounded-md border border-line bg-transparent p-0.5" onChange={(event) => updateStyle({ backgroundColor: event.target.value })} /></label>{!bucketFillEditing && <button type="button" className="min-h-8 rounded-md px-2 text-left text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={() => updateStyle({ backgroundColor: "transparent" })}>Transparent</button>}</div></Section>}
        {openPanel === "properties" && <div className="grid gap-2.5">
          {(shapeEditing || freeDrawEditing || bucketFillEditing) && <Section label="Fill"><ChoiceRow>{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><NativeFillIcon value={value} /></Choice>)}</ChoiceRow></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing || freeDrawEditing || selectedEditable.some((element) => styleableElementTypes.has(element.type))) && <Section label="Stroke width"><ChoiceRow>{strokeWidthOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><NativeStrokeWidthIcon value={value} /></Choice>)}</ChoiceRow></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Stroke style"><ChoiceRow>{strokeStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><NativeStrokeStyleIcon value={value} /></Choice>)}</ChoiceRow></Section>}
          {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Sloppiness"><ChoiceRow>{roughnessOptions.map(({ value, label }) => <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><NativeSloppinessIcon value={value} /></Choice>)}</ChoiceRow></Section>}
          {!bucketFillEditing && shapeEditing && <Section label="Edges"><ChoiceRow><Choice label="Sharp edges" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><NativeEdgeIcon value="sharp" /></Choice><Choice label="Rounded edges" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><NativeEdgeIcon value="round" /></Choice></ChoiceRow></Section>}
          {!bucketFillEditing && freeDrawEditing && <Section label="Pressure"><ChoiceRow><Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}><NativePressureIcon value="constant" /></Choice><Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}><NativePressureIcon value="variable" /></Choice></ChoiceRow></Section>}
          <Section label="Opacity"><div className="flex items-center gap-2 px-1"><input type="range" min="0" max="100" value={opacity} aria-label="Opacity" className="h-1.5 min-w-0 flex-1 accent-accent" onChange={(event) => updateStyle({ opacity: Number(event.target.value) })} /><output className="w-8 text-right text-[9px] tabular-nums text-muted">{Math.round(opacity)}%</output></div></Section>
        </div>}
        {openPanel === "arrow" && selectedArrow && <div className="grid gap-2.5"><Section label="Arrow type"><ChoiceRow>{(["sharp", "round", "elbow"] as const).map((value) => <Choice key={value} label={value === "sharp" ? "Sharp arrow" : value === "round" ? "Curved arrow" : "Elbow arrow"} active={arrowType === value} onClick={() => updateArrowType(value)}><NativeArrowTypeIcon type={value} /></Choice>)}</ChoiceRow></Section><Section label="Start arrowhead"><ChoiceRow>{arrowheadOptions.map(({ value, label }) => <Choice key={`start-${label}`} label={`Start ${label}`} active={startArrowhead === value} onClick={() => updateArrowhead("start", value)}><NativeArrowheadIcon value={value} flip /></Choice>)}</ChoiceRow></Section><Section label="End arrowhead"><ChoiceRow>{arrowheadOptions.map(({ value, label }) => <Choice key={`end-${label}`} label={`End ${label}`} active={endArrowhead === value} onClick={() => updateArrowhead("end", value)}><NativeArrowheadIcon value={value} /></Choice>)}</ChoiceRow></Section></div>}
        {openPanel === "font" && <Section label="Font family"><div className="grid gap-1">{fontFamilyOptions.map(({ value, label }) => <button key={label} type="button" className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent", fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}><span className="w-6 text-center text-[13px]">Aa</span><span>{label}</span></button>)}</div></Section>}
        {openPanel === "text" && <div className="grid gap-2.5"><Section label="Font size"><ChoiceRow>{fontSizeOptions.map((value) => <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[10px] font-medium tabular-nums">{value}</span></Choice>)}</ChoiceRow></Section><Section label="Text align"><ChoiceRow>{textAlignOptions.map(({ value, label }) => <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><NativeTextAlignIcon value={value} /></Choice>)}</ChoiceRow></Section></div>}
        {openPanel === "more" && <div className="grid gap-2.5">
          <Section label="Layer"><ChoiceRow><ActionButton api={api} name="sendToBack" label="Send to back" fallback={Layers} onClick={() => runAndClose("sendToBack")} /><ActionButton api={api} name="sendBackward" label="Send backward" fallback={Layers} onClick={() => runAndClose("sendBackward")} /><ActionButton api={api} name="bringForward" label="Bring forward" fallback={Layers} onClick={() => runAndClose("bringForward")} /><ActionButton api={api} name="bringToFront" label="Bring to front" fallback={Layers} onClick={() => runAndClose("bringToFront")} /></ChoiceRow></Section>
          {selectedElementCount >= 2 && <Section label="Align & distribute"><ChoiceRow><ActionButton api={api} name="alignLeft" label="Align left" fallback={AlignHorizontalJustifyStart} onClick={() => runAndClose("alignLeft")} /><ActionButton api={api} name="alignHorizontallyCentered" label="Align center" fallback={AlignHorizontalJustifyCenter} onClick={() => runAndClose("alignHorizontallyCentered")} /><ActionButton api={api} name="alignRight" label="Align right" fallback={AlignHorizontalJustifyEnd} onClick={() => runAndClose("alignRight")} /><ActionButton api={api} name="distributeHorizontally" label="Distribute horizontally" fallback={AlignHorizontalDistributeCenter} disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeHorizontally")} /><ActionButton api={api} name="alignTop" label="Align top" fallback={AlignVerticalJustifyStart} onClick={() => runAndClose("alignTop")} /><ActionButton api={api} name="alignVerticallyCentered" label="Align middle" fallback={AlignVerticalJustifyCenter} onClick={() => runAndClose("alignVerticallyCentered")} /><ActionButton api={api} name="alignBottom" label="Align bottom" fallback={AlignVerticalJustifyEnd} onClick={() => runAndClose("alignBottom")} /><ActionButton api={api} name="distributeVertically" label="Distribute vertically" fallback={AlignVerticalDistributeCenter} disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeVertically")} /></ChoiceRow></Section>}
          <Section label="Group & edit"><div className="grid gap-0.5"><ActionRow api={api} name="group" label="Group" fallback={Network} disabled={selectedElementCount < 2} onClick={() => runAndClose("group")} /><ActionRow api={api} name="ungroup" label="Ungroup" fallback={Network} disabled={!hasSelection} onClick={() => runAndClose("ungroup")} /><ActionRow api={api} name="duplicateSelection" label="Duplicate" fallback={Copy} disabled={!hasSelection} onClick={() => runAndClose("duplicateSelection")} /><ActionRow api={api} name="deleteSelectedElements" label="Delete" fallback={Trash2} danger disabled={!hasSelection} onClick={() => runAndClose("deleteSelectedElements")} /></div></Section>
          <Section label="Transform & reuse"><div className="grid gap-0.5"><ActionRow api={api} name="flipHorizontal" label="Flip horizontally" fallback={FlipHorizontal2} disabled={!hasSelection} onClick={() => runAndClose("flipHorizontal")} /><ActionRow api={api} name="flipVertical" label="Flip vertically" fallback={FlipVertical2} disabled={!hasSelection} onClick={() => runAndClose("flipVertical")} /><ActionRow api={api} name="toggleElementLock" label="Lock or unlock" fallback={LockKeyhole} disabled={!hasSelection} onClick={() => runAndClose("toggleElementLock")} /><ActionRow api={api} name="wrapSelectionInFrame" label="Wrap in frame" fallback={SquareDashed} disabled={!hasSelection} onClick={() => runAndClose("wrapSelectionInFrame")} /><ActionRow api={api} name="addToLibrary" label="Add to library" fallback={Library} disabled={!hasSelection} onClick={() => runAndClose("addToLibrary")} /></div></Section>
        </div>}
      </motion.div>
    );
  };

  const linearEditorIcon = showLinearEditor ? nativeActionIcon(api, "toggleLinearEditor") : null;

  return (
    <motion.div ref={rootRef} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="notespace-selection-actions pointer-events-auto absolute bottom-2 left-1/2 z-[90] flex h-11 w-[min(520px,calc(100%-16px))] -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-none min-[561px]:top-1/2 min-[561px]:bottom-auto min-[561px]:left-[56px] min-[561px]:h-auto min-[561px]:max-h-[calc(100dvh-16px)] min-[561px]:w-12 min-[561px]:translate-x-0 min-[561px]:-translate-y-1/2 min-[561px]:flex-col [&~_.excalidraw_.mobile-shape-actions]:!hidden" role="toolbar" aria-label="Selected shape actions" onPointerDown={(event) => event.stopPropagation()}>
      <AnimatePresence initial={false}>{renderPanel()}</AnimatePresence>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[561px]:w-full min-[561px]:flex-none min-[561px]:flex-col min-[561px]:overflow-x-hidden min-[561px]:overflow-y-auto">
        {showStroke && <SwatchButton label="Stroke color" color={strokeColor} open={openPanel === "stroke"} onClick={() => setOpenPanel((panel) => panel === "stroke" ? null : "stroke")} />}
        {showFill && <SwatchButton label="Fill color" color={backgroundColor} open={openPanel === "fill"} onClick={() => setOpenPanel((panel) => panel === "fill" ? null : "fill")} />}
        {freeDrawEditing && <CompactButton label="Freedraw pressure" onClick={() => updateStyle({ pressure: pressure === "variable" ? "constant" : "variable" })}><NativePressureIcon value={pressure} /></CompactButton>}
        {shapeProperties && <CompactButton label="Shape properties" open={openPanel === "properties"} onClick={() => setOpenPanel((panel) => panel === "properties" ? null : "properties")}><NativeAdjustmentsIcon /></CompactButton>}
        {showArrow && <CompactButton label="Arrow properties" open={openPanel === "arrow"} onClick={() => setOpenPanel((panel) => panel === "arrow" ? null : "arrow")}><NativeArrowTypeIcon type={arrowType} /></CompactButton>}
        {showLinearEditor && <CompactButton label="Edit line" onClick={() => onAction("toggleLinearEditor")}>{linearEditorIcon ? <span className="grid place-items-center [&_svg]:size-4 min-[561px]:[&_svg]:size-5">{linearEditorIcon}</span> : <NativePencilIcon />}</CompactButton>}
        {showText && <><CompactButton label="Font family" open={openPanel === "font"} onClick={() => setOpenPanel((panel) => panel === "font" ? null : "font")}><span className="text-[12px] font-medium leading-none min-[561px]:text-[14px]">Aa</span></CompactButton><CompactButton label="Text properties" open={openPanel === "text"} onClick={() => setOpenPanel((panel) => panel === "text" ? null : "text")}><NativeTextSizeIcon /></CompactButton></>}
        <CompactButton label="More selected shape actions" open={openPanel === "more"} onClick={() => setOpenPanel((panel) => panel === "more" ? null : "more")}><NativeDotsHorizontalIcon /></CompactButton>
      </div>
    </motion.div>
  );
}
