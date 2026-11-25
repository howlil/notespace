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
  NonDeletedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import { executeNativeAction } from "../core/excalidraw-bridge/CanvasNativeActions";
import { analyzeCanvasSelection, canvasStylePatchForElement, sharedCanvasValue, supportsCanvasStyle, type CanvasStyleProperty } from "./canvas-selection-capabilities";

export type StrokeWidthKey = "thin" | "medium" | "bold";
export type ArrowType = "sharp" | "round" | "elbow";

export type StylePatch = {
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

export const styleableElementTypes = new Set<ExcalidrawElement["type"]>(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "embeddable"]);

export const strokeWidthOptions: readonly { value: StrokeWidthKey; label: string }[] = [
  { value: "thin", label: "Thin" },
  { value: "medium", label: "Medium" },
  { value: "bold", label: "Bold" },
];

export const strokeStyleOptions: readonly { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

export const roughnessOptions: readonly { value: number; label: string }[] = [
  { value: 0, label: "Clean" },
  { value: 1, label: "Hand-drawn" },
  { value: 2, label: "Rough" },
];

export const fillStyleOptions: readonly { value: FillStyle; label: string }[] = [
  { value: "hachure", label: "Hachure" },
  { value: "cross-hatch", label: "Cross hatch" },
  { value: "solid", label: "Solid" },
];

export const fontSizeOptions = [16, 20, 28, 36] as const;

export const fontFamilyOptions: readonly { value: FontFamilyValues; label: string }[] = [
  { value: FONT_FAMILY.Excalifont as FontFamilyValues, label: "Excalifont" },
  { value: FONT_FAMILY.Helvetica as FontFamilyValues, label: "Helvetica" },
  { value: FONT_FAMILY.Cascadia as FontFamilyValues, label: "Cascadia" },
  { value: FONT_FAMILY.Nunito as FontFamilyValues, label: "Nunito" },
  { value: FONT_FAMILY["Lilita One"] as FontFamilyValues, label: "Lilita One" },
  { value: FONT_FAMILY["Comic Shanns"] as FontFamilyValues, label: "Comic Shanns" },
  { value: FONT_FAMILY["Liberation Sans"] as FontFamilyValues, label: "Liberation Sans" },
  { value: FONT_FAMILY.Assistant as FontFamilyValues, label: "Assistant" },
];

export const arrowheadOptions: readonly { value: Arrowhead | null; label: string }[] = [
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

export const textAlignOptions: readonly { value: TextAlign; label: string }[] = [
  { value: "left" as TextAlign, label: "Left" },
  { value: "center" as TextAlign, label: "Center" },
  { value: "right" as TextAlign, label: "Right" },
];

export const strokeColorOptions = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const;
export const fillColorOptions = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const;
export const bucketFillColorOptions = ["#ffffff", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"] as const;

export function selectionContext(api: ExcalidrawImperativeAPI | null, activeTool: AppState["activeTool"]["type"]) {
  const appState = api?.getAppState();
  const selectedIds = new Set(Object.entries(appState?.selectedElementIds ?? {}).filter(([, selected]) => selected).map(([id]) => id));
  const selectedElements = api?.getSceneElements().filter((element) => selectedIds.has(element.id) && !element.isDeleted) ?? [];
  const selectedEditable = selectedElements.filter((element) => styleableElementTypes.has(element.type) || element.type === "text");
  const primary = selectedEditable[0] ?? null;
  const single = selectedElements.length === 1 ? selectedElements[0] : null;
  const editingType = single?.type ?? (selectedElements.length === 0 ? activeTool : "selection");
  return {
    appState,
    selectedElements,
    selectedEditable,
    primary,
    capabilities: analyzeCanvasSelection(selectedElements),
    selectedArrow: selectedElements.find((element) => element.type === "arrow") ?? null,
    selectedFreeDraw: selectedElements.find((element) => element.type === "freedraw") ?? null,
    selectedText: selectedElements.find((element) => element.type === "text") ?? null,
    selectedEmbed: selectedElements.length === 1 && selectedElements[0]?.type === "embeddable"
      ? selectedElements[0] as NonDeletedExcalidrawElement
      : null,
    shapeEditing: editingType === "rectangle" || editingType === "diamond" || editingType === "ellipse",
    lineEditing: editingType === "line" || editingType === "arrow",
    freeDrawEditing: editingType === "freedraw",
    textEditing: editingType === "text",
    bucketFillEditing: selectedElements.length === 0 && activeTool === "bucketfill",
  };
}

export function readCanvasStyles(selectedElements: readonly NonDeletedExcalidrawElement[], activeTool: AppState["activeTool"]["type"], appState: AppState) {
  const mixedStyles = new Set<CanvasStyleProperty>();
  function read<T>(property: CanvasStyleProperty, get: (element: NonDeletedExcalidrawElement) => T, defaultValue: T): T | undefined {
    if (!selectedElements.length) return defaultValue;
    const value = sharedCanvasValue(selectedElements.filter((element) => supportsCanvasStyle(element, property)), get);
    if (value.kind === "mixed") mixedStyles.add(property);
    return value.kind === "shared" ? value.value : undefined;
  }
  const width = read("strokeWidth", (element) => element.strokeWidth, getStrokeWidthByKey(activeTool, appState.currentItemStrokeWidthKey ?? "thin"));
  const strokeType = selectedElements.find((element) => supportsCanvasStyle(element, "strokeWidth"))?.type ?? activeTool;
  return {
    mixedStyles,
    strokeWidth: width === undefined ? undefined : strokeWidthOptions.find(({ value }) => getStrokeWidthByKey(strokeType, value) === width)?.value,
    strokeColor: read("strokeColor", (element) => element.strokeColor, appState.currentItemStrokeColor ?? "#1e1e1e"),
    backgroundColor: read("backgroundColor", (element) => element.backgroundColor, appState.currentItemBackgroundColor ?? "transparent"),
    fillStyle: read("fillStyle", (element) => element.fillStyle, appState.currentItemFillStyle ?? "hachure"),
    strokeStyle: read("strokeStyle", (element) => element.strokeStyle, appState.currentItemStrokeStyle ?? "solid"),
    roughness: read("roughness", (element) => element.roughness, appState.currentItemRoughness ?? 0),
    roundness: read("roundness", (element) => element.roundness ? "round" : "sharp", appState.currentItemRoundness ?? "sharp"),
    pressure: read("pressure", (element) => element.type === "freedraw" ? element.strokeOptions.variability : "variable", appState.currentItemStrokeVariability ?? "variable"),
    opacity: read("opacity", (element) => element.opacity, appState.currentItemOpacity ?? 100),
    startArrowhead: read("startArrowhead", (element) => element.type === "arrow" ? element.startArrowhead : null, appState.currentItemStartArrowhead ?? null),
    endArrowhead: read("endArrowhead", (element) => element.type === "arrow" ? element.endArrowhead : null, appState.currentItemEndArrowhead ?? null),
    arrowType: read<ArrowType>("arrowType", (element) => "elbowed" in element && element.elbowed ? "elbow" : element.roundness ? "round" : "sharp", "sharp"),
    fontFamily: read("fontFamily", (element) => element.type === "text" ? element.fontFamily : FONT_FAMILY.Excalifont, appState.currentItemFontFamily ?? FONT_FAMILY.Excalifont),
    fontSize: read("fontSize", (element) => element.type === "text" ? element.fontSize : 20, appState.currentItemFontSize ?? 20),
    textAlign: read("textAlign", (element) => element.type === "text" ? element.textAlign : "left", appState.currentItemTextAlign ?? "left"),
  };
}

export function applyCanvasStylePatch(
  api: ExcalidrawImperativeAPI,
  context: ReturnType<typeof selectionContext>,
  activeTool: AppState["activeTool"]["type"],
  patch: StylePatch,
) {
  const { selectedElements, primary, selectedArrow, selectedFreeDraw } = context;
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
  if (patch.fontSize !== undefined) { nextAppState.currentItemFontSize = patch.fontSize; elementPatch.fontSize = patch.fontSize; }
  if (patch.textAlign !== undefined) { nextAppState.currentItemTextAlign = patch.textAlign; elementPatch.textAlign = patch.textAlign; }
  if (patch.arrowType !== undefined && selectedArrow) { elementPatch.elbowed = patch.arrowType === "elbow"; elementPatch.roundness = patch.arrowType === "round" ? { type: ROUNDNESS.PROPORTIONAL_RADIUS } : null; }

  const editableIds = new Set(selectedElements.map((element) => element.id));
  if (editableIds.size > 0 && Object.keys(elementPatch).length > 0) {
    const elements = api.getSceneElements().map((element) => {
      if (!editableIds.has(element.id)) return element;
      const nextPatch = canvasStylePatchForElement(element, elementPatch);
      if (patch.strokeWidth && supportsCanvasStyle(element, "strokeWidth")) nextPatch.strokeWidth = getStrokeWidthByKey(element.type, patch.strokeWidth);
      return Object.keys(nextPatch).length ? newElementWith(element, nextPatch) : element;
    });
    api.updateScene({ elements, appState: { ...currentState, ...nextAppState }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  } else {
    api.updateScene({ appState: { ...currentState, ...nextAppState }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }
}

export function applyArrowType(
  api: ExcalidrawImperativeAPI,
  context: ReturnType<typeof selectionContext>,
  activeTool: AppState["activeTool"]["type"],
  value: ArrowType,
) {
  if (!executeNativeAction(api, "changeArrowType", value)) {
    applyCanvasStylePatch(api, context, activeTool, { arrowType: value });
  }
}

export function applyArrowhead(
  api: ExcalidrawImperativeAPI,
  context: ReturnType<typeof selectionContext>,
  activeTool: AppState["activeTool"]["type"],
  position: "start" | "end",
  value: Arrowhead | null,
) {
  if (!executeNativeAction(api, "changeArrowhead", { position, type: value })) {
    applyCanvasStylePatch(api, context, activeTool, position === "start" ? { startArrowhead: value } : { endArrowhead: value });
  }
}
