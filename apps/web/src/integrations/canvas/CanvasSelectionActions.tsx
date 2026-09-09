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
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "../../components/ui";
import { useDismissablePopup } from "../../components/ui/dismissable";
import { executeNativeAction, nativeActionIcon } from "./CanvasNativeActions";
import {
  NativeAdjustmentsIcon,
  NativeArrowheadIcon,
  NativeArrowTypeIcon,
  NativeDotsHorizontalIcon,
  NativeEdgeIcon,
  NativeFillIcon,
  NativeFrameIcon,
  NativeLibraryIcon,
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

type Panel = "color" | "properties" | "arrow" | "font" | "text" | "more";
type StrokeWidthKey = "thin" | "medium" | "bold";
type ArrowType = "sharp" | "round" | "elbow";
type GridColumns = 2 | 3 | 4 | 5;

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
const panelWidthClass: Record<Panel, string> = {
  color: "w-[min(212px,calc(100vw-24px))]",
  properties: "w-[min(176px,calc(100vw-24px))]",
  arrow: "w-[min(208px,calc(100vw-24px))]",
  font: "w-[min(216px,calc(100vw-24px))]",
  text: "w-[min(176px,calc(100vw-24px))]",
  more: "w-[min(176px,calc(100vw-24px))]",
};
const optionGridClass: Record<GridColumns, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

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
  { value: 0, label: "Clean" },
  { value: 1, label: "Hand-drawn" },
  { value: 2, label: "Rough" },
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

const strokeColorOptions = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const;
const fillColorOptions = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const;
const bucketFillColorOptions = ["#ffffff", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const;

function Choice({ label, active, children, onClick }: { label: string; active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-canvas text-ink transition-[color,background-color,border-color,transform] duration-100 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] [&_svg]:size-4",
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

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={label}>
      <h3 className="m-0 text-[9px] font-medium text-muted">{label}</h3>
      {children}
    </section>
  );
}

function OptionGrid({ columns, children }: { columns: GridColumns; children: ReactNode }) {
  return <div className={cn("grid w-fit gap-1", optionGridClass[columns])}>{children}</div>;
}

function CompactButton({ label, open, children, onClick }: { label: string; open?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-100 hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96] [&_svg]:size-4",
        open && "bg-tint text-accent ring-1 ring-accent/15",
      )}
      aria-label={label}
      aria-expanded={open}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TransparentMark() {
  return <span className="absolute inset-[3px] rotate-45 border-t border-danger" aria-hidden="true" />;
}

function ColorChip({ color, sizeClass = "size-4" }: { color: string; sizeClass?: string }) {
  return (
    <span
      className={cn("relative block rounded-[4px] border border-line", sizeClass)}
      style={{ backgroundColor: color === "transparent" ? "var(--surface)" : color }}
      aria-hidden="true"
    >
      {color === "transparent" && <TransparentMark />}
    </span>
  );
}

function ColorTrigger({ strokeColor, fillColor, showStroke, showFill, open, onClick }: {
  strokeColor: string;
  fillColor: string;
  showStroke: boolean;
  showFill: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <CompactButton label="Colors" open={open} onClick={onClick}>
      <span className="relative block size-5" aria-hidden="true">
        {showStroke && <span className="absolute top-0 left-0 size-[14px] rounded-[4px] border-2 bg-surface" style={{ borderColor: strokeColor }} />}
        {showFill && <span className="absolute right-0 bottom-0"><ColorChip color={fillColor} sizeClass="size-[14px]" /></span>}
      </span>
    </CompactButton>
  );
}

function ColorSwatches({ colors, current, label, onChange }: {
  colors: readonly string[];
  current: string;
  label: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid w-fit grid-cols-6 gap-1" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "grid size-7 place-items-center rounded-md border border-transparent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent",
            current.toLowerCase() === color.toLowerCase() && "border-accent bg-tint ring-1 ring-accent/15",
          )}
          aria-label={`${label}: ${color === "transparent" ? "Transparent" : color}`}
          aria-pressed={current.toLowerCase() === color.toLowerCase()}
          title={color === "transparent" ? "Transparent" : color}
          onClick={() => onChange(color)}
        >
          <ColorChip color={color} sizeClass="size-5" />
        </button>
      ))}
      <label className="grid size-7 cursor-pointer place-items-center rounded-md border border-line bg-canvas hover:bg-tint" title={`Custom ${label.toLowerCase()}`}>
        <span className="sr-only">Custom {label.toLowerCase()}</span>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#ffffff"}
          aria-label={`Custom ${label.toLowerCase()}`}
          className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function fallbackActionIcon(name: CanvasRuntimeActionName) {
  if (name === "wrapSelectionInFrame") return <NativeFrameIcon className="size-4" />;
  if (name === "addToLibrary") return <NativeLibraryIcon className="size-4" />;
  return <NativeDotsHorizontalIcon className="size-4" />;
}

function ActionButton({ api, name, label, disabled, danger, onClick }: {
  api: ExcalidrawImperativeAPI;
  name: CanvasRuntimeActionName;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const icon = nativeActionIcon(api, name);
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 place-items-center rounded-md bg-canvas text-ink transition-[color,background-color,transform] duration-100 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96] disabled:cursor-default disabled:opacity-40 [&_svg]:size-4",
        danger && "hover:text-danger",
      )}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <span className="grid place-items-center [&_svg]:size-4">{icon}</span> : fallbackActionIcon(name)}
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

  const strokeColor = primary?.strokeColor ?? selectedText?.strokeColor ?? appState.currentItemStrokeColor ?? "#1e1e1e";
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
    const elementPatch: {
      strokeColor?: string;
      backgroundColor?: string;
      fillStyle?: FillStyle;
      strokeWidth?: number;
      strokeStyle?: StrokeStyle;
      roughness?: number;
      roundness?: ExcalidrawElement["roundness"];
      elbowed?: boolean;
      strokeOptions?: { variability: StrokeVariability; streamline: number };
      opacity?: number;
      startArrowhead?: Arrowhead | null;
      endArrowhead?: Arrowhead | null;
      fontFamily?: FontFamilyValues;
      fontSize?: number;
      textAlign?: TextAlign;
    } = {};

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
    return (
      <motion.div
        key={openPanel}
        initial={{ opacity: 0, y: 3, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 3, scale: 0.985 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className={cn(
          "absolute bottom-[calc(100%+6px)] left-1/2 z-[110] max-h-[min(58dvh,420px)] -translate-x-1/2 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-3 text-ink shadow-none min-[561px]:top-0 min-[561px]:bottom-auto min-[561px]:left-[calc(100%+6px)] min-[561px]:translate-x-0",
          panelWidthClass[openPanel],
        )}
        role="dialog"
        aria-label={`${openPanel} properties`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {openPanel === "color" && (
          <div className="grid gap-4">
            {showStroke && <Section label="Stroke color"><ColorSwatches colors={strokeColorOptions} current={strokeColor} label="Stroke color" onChange={(color) => updateStyle({ strokeColor: color })} /></Section>}
            {showFill && <Section label="Fill color"><ColorSwatches colors={bucketFillEditing ? bucketFillColorOptions : fillColorOptions} current={backgroundColor} label="Fill color" onChange={(color) => updateStyle({ backgroundColor: color })} /></Section>}
          </div>
        )}

        {openPanel === "properties" && (
          <div className="grid gap-4">
            {(shapeEditing || freeDrawEditing || bucketFillEditing) && <Section label="Fill"><OptionGrid columns={3}>{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><NativeFillIcon value={value} /></Choice>)}</OptionGrid></Section>}
            {!bucketFillEditing && (shapeEditing || lineEditing || freeDrawEditing || selectedEditable.some((element) => styleableElementTypes.has(element.type))) && <Section label="Stroke width"><OptionGrid columns={3}>{strokeWidthOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><NativeStrokeWidthIcon value={value} /></Choice>)}</OptionGrid></Section>}
            {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Stroke pattern"><OptionGrid columns={3}>{strokeStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><NativeStrokeStyleIcon value={value} /></Choice>)}</OptionGrid></Section>}
            {!bucketFillEditing && (shapeEditing || lineEditing) && <Section label="Line feel"><OptionGrid columns={3}>{roughnessOptions.map(({ value, label }) => <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><NativeSloppinessIcon value={value} /></Choice>)}</OptionGrid></Section>}
            {!bucketFillEditing && shapeEditing && <Section label="Corners"><OptionGrid columns={2}><Choice label="Sharp corners" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><NativeEdgeIcon value="sharp" /></Choice><Choice label="Rounded corners" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><NativeEdgeIcon value="round" /></Choice></OptionGrid></Section>}
            {!bucketFillEditing && freeDrawEditing && <Section label="Pressure"><OptionGrid columns={2}><Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}><NativePressureIcon value="constant" /></Choice><Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}><NativePressureIcon value="variable" /></Choice></OptionGrid></Section>}
            <Section label="Opacity"><div className="flex items-center gap-2"><input type="range" min="0" max="100" value={opacity} aria-label="Opacity" className="h-1.5 min-w-0 flex-1 accent-accent" onChange={(event) => updateStyle({ opacity: Number(event.target.value) })} /><output className="w-8 text-right text-[9px] tabular-nums text-muted">{Math.round(opacity)}%</output></div></Section>
          </div>
        )}

        {openPanel === "arrow" && selectedArrow && (
          <div className="grid gap-4">
            <Section label="Arrow type"><OptionGrid columns={3}>{(["sharp", "round", "elbow"] as const).map((value) => <Choice key={value} label={value === "sharp" ? "Sharp arrow" : value === "round" ? "Curved arrow" : "Elbow arrow"} active={arrowType === value} onClick={() => updateArrowType(value)}><NativeArrowTypeIcon type={value} /></Choice>)}</OptionGrid></Section>
            <Section label="Start arrowhead"><OptionGrid columns={5}>{arrowheadOptions.map(({ value, label }) => <Choice key={`start-${label}`} label={`Start ${label}`} active={startArrowhead === value} onClick={() => updateArrowhead("start", value)}><NativeArrowheadIcon value={value} flip /></Choice>)}</OptionGrid></Section>
            <Section label="End arrowhead"><OptionGrid columns={5}>{arrowheadOptions.map(({ value, label }) => <Choice key={`end-${label}`} label={`End ${label}`} active={endArrowhead === value} onClick={() => updateArrowhead("end", value)}><NativeArrowheadIcon value={value} /></Choice>)}</OptionGrid></Section>
          </div>
        )}

        {openPanel === "font" && <Section label="Font family"><div className="grid gap-1">{fontFamilyOptions.map(({ value, label }) => <button key={label} type="button" className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent", fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}><span className="w-5 text-center text-[12px]">Aa</span><span>{label}</span></button>)}</div></Section>}

        {openPanel === "text" && (
          <div className="grid gap-4">
            <Section label="Font size"><OptionGrid columns={4}>{fontSizeOptions.map((value) => <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[9px] font-medium tabular-nums">{value}</span></Choice>)}</OptionGrid></Section>
            <Section label="Text align"><OptionGrid columns={3}>{textAlignOptions.map(({ value, label }) => <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><NativeTextAlignIcon value={value} /></Choice>)}</OptionGrid></Section>
          </div>
        )}

        {openPanel === "more" && (
          <div className="grid gap-4">
            <Section label="Layer"><OptionGrid columns={4}><ActionButton api={api} name="sendToBack" label="Send to back" onClick={() => runAndClose("sendToBack")} /><ActionButton api={api} name="sendBackward" label="Send backward" onClick={() => runAndClose("sendBackward")} /><ActionButton api={api} name="bringForward" label="Bring forward" onClick={() => runAndClose("bringForward")} /><ActionButton api={api} name="bringToFront" label="Bring to front" onClick={() => runAndClose("bringToFront")} /></OptionGrid></Section>
            {selectedElementCount >= 2 && <Section label="Align & distribute"><OptionGrid columns={4}><ActionButton api={api} name="alignLeft" label="Align left" onClick={() => runAndClose("alignLeft")} /><ActionButton api={api} name="alignHorizontallyCentered" label="Align center" onClick={() => runAndClose("alignHorizontallyCentered")} /><ActionButton api={api} name="alignRight" label="Align right" onClick={() => runAndClose("alignRight")} /><ActionButton api={api} name="distributeHorizontally" label="Distribute horizontally" disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeHorizontally")} /><ActionButton api={api} name="alignTop" label="Align top" onClick={() => runAndClose("alignTop")} /><ActionButton api={api} name="alignVerticallyCentered" label="Align middle" onClick={() => runAndClose("alignVerticallyCentered")} /><ActionButton api={api} name="alignBottom" label="Align bottom" onClick={() => runAndClose("alignBottom")} /><ActionButton api={api} name="distributeVertically" label="Distribute vertically" disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeVertically")} /></OptionGrid></Section>}
            <Section label="Group & edit"><OptionGrid columns={4}><ActionButton api={api} name="group" label="Group" disabled={selectedElementCount < 2} onClick={() => runAndClose("group")} /><ActionButton api={api} name="ungroup" label="Ungroup" disabled={!hasSelection} onClick={() => runAndClose("ungroup")} /><ActionButton api={api} name="duplicateSelection" label="Duplicate" disabled={!hasSelection} onClick={() => runAndClose("duplicateSelection")} /><ActionButton api={api} name="deleteSelectedElements" label="Delete" danger disabled={!hasSelection} onClick={() => runAndClose("deleteSelectedElements")} /></OptionGrid></Section>
            <Section label="Transform & reuse"><OptionGrid columns={4}><ActionButton api={api} name="flipHorizontal" label="Flip horizontally" disabled={!hasSelection} onClick={() => runAndClose("flipHorizontal")} /><ActionButton api={api} name="flipVertical" label="Flip vertically" disabled={!hasSelection} onClick={() => runAndClose("flipVertical")} /><ActionButton api={api} name="toggleElementLock" label="Lock or unlock" disabled={!hasSelection} onClick={() => runAndClose("toggleElementLock")} /><ActionButton api={api} name="wrapSelectionInFrame" label="Wrap in frame" disabled={!hasSelection} onClick={() => runAndClose("wrapSelectionInFrame")} /><ActionButton api={api} name="addToLibrary" label="Add to library" disabled={!hasSelection} onClick={() => runAndClose("addToLibrary")} /></OptionGrid></Section>
          </div>
        )}
      </motion.div>
    );
  };

  const linearEditorIcon = showLinearEditor ? nativeActionIcon(api, "toggleLinearEditor") : null;
  const showColors = showStroke || showFill;

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="notespace-selection-actions pointer-events-auto absolute bottom-2 left-1/2 z-[90] flex h-10 w-[min(520px,calc(100%-16px))] -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-none min-[561px]:top-1/2 min-[561px]:bottom-auto min-[561px]:left-[48px] min-[561px]:h-auto min-[561px]:max-h-[calc(100dvh-16px)] min-[561px]:w-10 min-[561px]:translate-x-0 min-[561px]:-translate-y-1/2 min-[561px]:flex-col [&~_.excalidraw_.mobile-shape-actions]:!hidden"
      role="toolbar"
      aria-label="Selected shape actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <AnimatePresence initial={false}>{renderPanel()}</AnimatePresence>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[561px]:w-full min-[561px]:flex-none min-[561px]:flex-col min-[561px]:overflow-x-hidden min-[561px]:overflow-y-auto">
        {showColors && <ColorTrigger strokeColor={strokeColor} fillColor={backgroundColor} showStroke={showStroke} showFill={showFill} open={openPanel === "color"} onClick={() => setOpenPanel((panel) => panel === "color" ? null : "color")} />}
        {shapeProperties && <CompactButton label="Drawing properties" open={openPanel === "properties"} onClick={() => setOpenPanel((panel) => panel === "properties" ? null : "properties")}><NativeAdjustmentsIcon /></CompactButton>}
        {showArrow && <CompactButton label="Arrow properties" open={openPanel === "arrow"} onClick={() => setOpenPanel((panel) => panel === "arrow" ? null : "arrow")}><NativeArrowTypeIcon type={arrowType} /></CompactButton>}
        {showLinearEditor && <CompactButton label="Edit line" onClick={() => onAction("toggleLinearEditor")}>{linearEditorIcon ? <span className="grid place-items-center [&_svg]:size-4">{linearEditorIcon}</span> : <NativePencilIcon />}</CompactButton>}
        {showText && <><CompactButton label="Font family" open={openPanel === "font"} onClick={() => setOpenPanel((panel) => panel === "font" ? null : "font")}><span className="text-[12px] font-medium leading-none">Aa</span></CompactButton><CompactButton label="Text properties" open={openPanel === "text"} onClick={() => setOpenPanel((panel) => panel === "text" ? null : "text")}><NativeTextSizeIcon /></CompactButton></>}
        <CompactButton label="More selected shape actions" open={openPanel === "more"} onClick={() => setOpenPanel((panel) => panel === "more" ? null : "more")}><NativeDotsHorizontalIcon /></CompactButton>
      </div>
    </motion.div>
  );
}
