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
import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEventHandler } from "react";
import { cn } from "../../../../shared/ui";
import { openExternalUrl } from "../../../../adapters/browser/external-links";
import { useDismissablePopup } from "../../../../shared/ui/overlays/dismissable";
import { executeNativeAction, nativeActionAvailable, nativeActionIcon } from "../native/CanvasNativeActions";
import {
  NativeAdjustmentsIcon,
  NativeArrowheadIcon,
  NativeArrowTypeIcon,
  NativeDotsHorizontalIcon,
  NativeEdgeIcon,
  NativeEmbedIcon,
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
} from "../native/CanvasNativeIcons";
import type { CanvasActionName } from "../native/CanvasToolbar";
import { analyzeCanvasSelection, canvasStylePatchForElement, sharedCanvasValue, supportsCanvasStyle, type CanvasStyleProperty } from "./canvas-selection-capabilities";
import { canvasToolName } from "../chrome/canvas-tool-catalog";
import type { CanvasContextualAnchor } from "../chrome/CanvasBottomChrome";
import { Choice, Section, OptionGrid, OpacityControl, CompactButton, ColorTrigger, ColorSwatches } from "./CanvasSelectionControls";
import { selectionPanelPosition, type PanelLayout } from "./canvas-selection-position";

export type CanvasRuntimeActionName = CanvasActionName | "toggleLinearEditor" | "hyperlink";

type Panel = "color" | "properties" | "arrow" | "text" | "more";

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

const styleableElementTypes = new Set<ExcalidrawElement["type"]>(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "embeddable"]);
const inactiveTools = new Set<AppState["activeTool"]["type"]>(["selection", "eraser", "hand", "laser", "lasso"]);
const panelWidthClass: Record<Panel, string> = {
  color: "w-max max-w-[calc(100vw-24px)]",
  properties: "w-max max-w-[calc(100vw-24px)]",
  arrow: "w-max max-w-[calc(100vw-24px)]",
  text: "w-max max-w-[calc(100vw-24px)]",
  more: "w-max max-w-[calc(100vw-24px)]",
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

function fallbackActionIcon(name: CanvasRuntimeActionName) {
  if (name === "wrapSelectionInFrame") return <NativeFrameIcon className="size-4" />;
  if (name === "addToLibrary") return <NativeLibraryIcon className="size-4" />;
  if (name === "hyperlink") return <NativeEmbedIcon className="size-4" />;
  return <NativeDotsHorizontalIcon className="size-4" />;
}

function MenuRowAction({ api, name, label, disabled, danger, onClick }: {
  api: ExcalidrawImperativeAPI;
  name: CanvasRuntimeActionName;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const icon = nativeActionIcon(api, name) ?? fallbackActionIcon(name);
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-8 w-max items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40",
        danger && "hover:text-danger",
      )}
      disabled={disabled || !nativeActionAvailable(api, name)}
      onClick={onClick}
    >
      <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function PropertyMenuAction({ label, onClick }: { label: string; onClick: MouseEventHandler<HTMLButtonElement> }) {
  return <button type="button" className="flex min-h-8 w-full items-center rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" onClick={onClick}>{label}</button>;
}

function selectionContext(api: ExcalidrawImperativeAPI | null, activeTool: AppState["activeTool"]["type"]) {
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

function readCanvasStyles(selectedElements: readonly NonDeletedExcalidrawElement[], activeTool: AppState["activeTool"]["type"], appState: AppState) {
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

export function CanvasSelectionActions({ api, activeTool, selectedElementCount, contextualAnchor, isManipulating = false, contextMenuOpen = false, viewModeEnabled = false, onAction, onInteractionStateChange, onOverlayOpen, onOverlayClose, overlayActive = true }: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  selectedElementCount: number;
  contextualAnchor?: CanvasContextualAnchor | null;
  isManipulating?: boolean;
  contextMenuOpen?: boolean;
  viewModeEnabled?: boolean;
  onAction: (name: CanvasRuntimeActionName) => void;
  onInteractionStateChange?: (active: boolean) => void;
  onOverlayOpen?: () => void;
  onOverlayClose?: () => void;
  overlayActive?: boolean;
}) {
  const [, refresh] = useState(0);
  const context = selectionContext(api, activeTool);
  const { appState, selectedElements, selectedEditable, primary, capabilities, selectedArrow, selectedFreeDraw, selectedText, selectedEmbed, shapeEditing, lineEditing, freeDrawEditing, textEditing, bucketFillEditing } = context;
  const hasSelection = selectedElements.length > 0;
  const hasStyleContext = selectedEditable.length > 0 || capabilities.opacity !== "none" || shapeEditing || lineEditing || freeDrawEditing || textEditing || bucketFillEditing;
  const hasContext = hasSelection || (!inactiveTools.has(activeTool) && hasStyleContext);
  const contextKey = hasSelection ? `selection:${selectedElements.map((element) => element.id).sort().join(",")}` : `tool:${activeTool}`;
  const [panelState, setPanelState] = useState<{ panel: Panel; contextKey: string } | null>(null);
  const openPanel = panelState?.contextKey === contextKey ? panelState.panel : null;
  const [compact, setCompact] = useState(false);
  const vertical = !hasSelection && !compact;
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closePanel = useCallback(() => {
    setPanelState(null);
    onOverlayClose?.();
  }, [onOverlayClose]);
  useDismissablePopup(rootRef, openPanel !== null, closePanel);

  useEffect(() => {
    if (overlayActive && !isManipulating && !contextMenuOpen && !viewModeEnabled) return;
    setPanelState(null);
    onOverlayClose?.();
  }, [contextMenuOpen, isManipulating, onOverlayClose, overlayActive, viewModeEnabled]);

  useLayoutEffect(() => {
    const surface = rootRef.current?.closest<HTMLElement>(".notespace-canvas-surface");
    if (!surface) return;
    const update = () => setCompact(surface.clientWidth <= 560);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [hasContext]);

  useEffect(() => {
    if (panelState && panelState.contextKey !== contextKey) closePanel();
  }, [closePanel, contextKey, panelState]);

  useEffect(() => {
    if (!openPanel) return;
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [openPanel]);

  const updatePanelLayout = useCallback(() => {
    const root = rootRef.current;
    const panel = panelRef.current;
    if (!root || !panel || !openPanel) {
      setPanelLayout((previous) => previous === null ? previous : null);
      return;
    }
    const rootBounds = root.getBoundingClientRect();
    const panelBounds = panel.getBoundingClientRect();
    const surfaceBounds = root.closest<HTMLElement>(".notespace-canvas-surface")?.getBoundingClientRect();
    const surfaceTop = surfaceBounds?.top ?? 8;
    const surfaceBottom = surfaceBounds?.bottom ?? window.innerHeight - 8;
    const surfaceLeft = surfaceBounds?.left ?? 8;
    const surfaceRight = surfaceBounds?.right ?? window.innerWidth - 8;
    const next = selectionPanelPosition(rootBounds, panelBounds,
      { top: surfaceTop, bottom: surfaceBottom, left: surfaceLeft, right: surfaceRight },
      { compact, vertical });
    setPanelLayout((previous) => previous?.placement === next.placement && previous.left === next.left && previous.top === next.top ? previous : next);
  }, [compact, openPanel, vertical]);

  useLayoutEffect(() => {
    if (!openPanel) {
      setPanelLayout(null);
      return undefined;
    }
    updatePanelLayout();
    const frame = window.requestAnimationFrame(updatePanelLayout);
    const panel = panelRef.current;
    const resizeObserver = panel && typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePanelLayout) : null;
    if (resizeObserver && panel) resizeObserver.observe(panel);
    window.addEventListener("resize", updatePanelLayout);
    window.addEventListener("scroll", updatePanelLayout, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePanelLayout);
      window.removeEventListener("scroll", updatePanelLayout, true);
    };
  }, [contextualAnchor, openPanel, updatePanelLayout]);

  const shouldShow = !viewModeEnabled && !contextMenuOpen && !isManipulating && hasContext;
  const embedInteractive = Boolean(selectedEmbed && appState?.activeEmbeddable?.element.id === selectedEmbed.id && appState.activeEmbeddable.state === "active");
  useEffect(() => {
    onInteractionStateChange?.(shouldShow && (openPanel !== null || embedInteractive));
  }, [embedInteractive, onInteractionStateChange, openPanel, shouldShow]);
  useEffect(() => () => onInteractionStateChange?.(false), [onInteractionStateChange]);
  if (!api || !appState || !hasContext) return null;

  const { mixedStyles, strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, roundness,
    pressure, opacity, startArrowhead, endArrowhead, arrowType, fontFamily, fontSize, textAlign } = readCanvasStyles(selectedElements, activeTool, appState);

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
  const togglePanel = (panel: Panel): MouseEventHandler<HTMLButtonElement> => (event) => {
    if (!event.currentTarget.closest('[role="dialog"]')) triggerRef.current = event.currentTarget;
    const nextPanel = openPanel === panel ? null : panel;
    setPanelState(nextPanel ? { panel: nextPanel, contextKey } : null);
    if (nextPanel) onOverlayOpen?.();
    else onOverlayClose?.();
    onInteractionStateChange?.(nextPanel !== null || embedInteractive);
  };
  const shapeProperties = shapeEditing || lineEditing || freeDrawEditing || textEditing || bucketFillEditing || capabilities.stroke === "all" || capabilities.opacity === "all";
  const showStroke = !bucketFillEditing && (hasSelection ? capabilities.stroke === "all" : (shapeProperties || textEditing));
  const showFill = bucketFillEditing || (!hasSelection && shapeEditing) || capabilities.fill === "all";
  const showArrow = capabilities.arrow === "all" && Boolean(selectedArrow);
  const showText = textEditing || (capabilities.text === "all" && Boolean(selectedText));
  const showLinearEditor = Boolean(hasSelection && capabilities.line === "all" && !capabilities.mixed);
  const showAdditionalDrawingOptions = shapeEditing || lineEditing || freeDrawEditing || capabilities.fill !== "none" || capabilities.line !== "none" || capabilities.freeDraw !== "none";
  const propertiesLabel = hasSelection ? "Object properties" : `${canvasToolName(activeTool)} settings`;
  const toggleEmbedInteraction = () => {
    if (!selectedEmbed) return;
    if (!embedInteractive) {
      api.updateScene({
        appState: {
          activeEmbeddable: { element: selectedEmbed, state: "active" },
          selectedElementIds: { [selectedEmbed.id]: true },
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      refresh((value) => value + 1);
      return;
    }

    const embedId = selectedEmbed.id;
    api.updateScene({
      appState: { activeEmbeddable: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    window.requestAnimationFrame(() => {
      const current = api.getSceneElements().find((element) => element.id === embedId && !element.isDeleted);
      if (!current) return;
      api.updateScene({
        appState: {
          activeEmbeddable: null,
          selectedElementIds: { [embedId]: true },
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      refresh((value) => value + 1);
    });
  };

  const renderPanel = () => {
    if (!openPanel) return null;
    if (typeof document === "undefined") return null;
    return (
      <div
        key={openPanel}
        ref={panelRef}
        className={cn(
          "absolute z-[110] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-line bg-surface text-ink shadow-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0",
          openPanel === "more" ? "max-h-[min(42dvh,300px)]" : "max-h-[min(42dvh,320px)]",
          panelWidthClass[openPanel],
        )}
        style={{ left: panelLayout?.left ?? 0, top: panelLayout?.top ?? 0, visibility: panelLayout ? "visible" : "hidden" }}
        data-placement={panelLayout?.placement}
        role="dialog"
        aria-label={openPanel === "properties" ? propertiesLabel : openPanel === "more" ? "Object actions" : `${openPanel} properties`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="p-2.5">
        {!hasSelection && <p className="mb-3 text-[11px] font-medium text-ink">{canvasToolName(activeTool)} settings</p>}
        {openPanel === "color" && (
          <div className="grid gap-4">
            {showStroke && <Section label="Stroke color" mixed={mixedStyles.has("strokeColor")}><ColorSwatches colors={strokeColorOptions} current={strokeColor} label="Stroke color" onChange={(color) => updateStyle({ strokeColor: color })} /></Section>}
            {showFill && <Section label="Fill color" mixed={mixedStyles.has("backgroundColor")}><ColorSwatches colors={bucketFillEditing ? bucketFillColorOptions : fillColorOptions} current={backgroundColor} label="Fill color" onChange={(color) => updateStyle({ backgroundColor: color })} /></Section>}
          </div>
        )}

        {openPanel === "properties" && (
          <div className="grid gap-3">
            {showFill && <Section label="Fill" mixed={mixedStyles.has("fillStyle")}><OptionGrid columns={3}>{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><NativeFillIcon value={value} /></Choice>)}</OptionGrid></Section>}
            {!bucketFillEditing && showStroke && <Section label="Stroke width" mixed={mixedStyles.has("strokeWidth")}><OptionGrid columns={3}>{strokeWidthOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><NativeStrokeWidthIcon value={value} /></Choice>)}</OptionGrid></Section>}
            <Section label="Opacity" mixed={mixedStyles.has("opacity")}><OpacityControl value={opacity} onChange={(value) => updateStyle({ opacity: value })} /></Section>
            {showAdditionalDrawingOptions && (
              <div className="grid gap-3 border-t border-line pt-3">
                {!showFill && capabilities.fill === "some" && <Section label="Fill · shapes" mixed={mixedStyles.has("fillStyle")}><OptionGrid columns={3}>{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><NativeFillIcon value={value} /></Choice>)}</OptionGrid></Section>}
                {(shapeEditing || lineEditing || capabilities.fill !== "none" || capabilities.line !== "none") && <Section label={capabilities.mixed ? "Stroke pattern · shapes and lines" : "Stroke pattern"} mixed={mixedStyles.has("strokeStyle")}><OptionGrid columns={3}>{strokeStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><NativeStrokeStyleIcon value={value} /></Choice>)}</OptionGrid></Section>}
                {(shapeEditing || lineEditing || capabilities.fill !== "none" || capabilities.line !== "none") && <Section label={capabilities.mixed ? "Line feel · shapes and lines" : "Line feel"} mixed={mixedStyles.has("roughness")}><OptionGrid columns={3}>{roughnessOptions.map(({ value, label }) => <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><NativeSloppinessIcon value={value} /></Choice>)}</OptionGrid></Section>}
                {(shapeEditing || capabilities.fill !== "none") && <Section label={capabilities.mixed ? "Corners · shapes" : "Corners"} mixed={mixedStyles.has("roundness")}><OptionGrid columns={2}><Choice label="Sharp corners" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><NativeEdgeIcon value="sharp" /></Choice><Choice label="Rounded corners" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><NativeEdgeIcon value="round" /></Choice></OptionGrid></Section>}
                {(freeDrawEditing || capabilities.freeDraw !== "none") && <Section label={capabilities.mixed ? "Pressure · pen" : "Pressure"} mixed={mixedStyles.has("pressure")}><OptionGrid columns={2}><Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}><NativePressureIcon value="constant" /></Choice><Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}><NativePressureIcon value="variable" /></Choice></OptionGrid></Section>}
              </div>
            )}
          </div>
        )}

        {openPanel === "arrow" && selectedArrow && (
          <div className="grid gap-4">
            <Section label="Arrow type" mixed={mixedStyles.has("arrowType")}><OptionGrid columns={3}>{(["sharp", "round", "elbow"] as const).map((value) => <Choice key={value} label={value === "sharp" ? "Sharp arrow" : value === "round" ? "Curved arrow" : "Elbow arrow"} active={arrowType === value} onClick={() => updateArrowType(value)}><NativeArrowTypeIcon type={value} /></Choice>)}</OptionGrid></Section>
            <Section label="Start arrowhead" mixed={mixedStyles.has("startArrowhead")}><OptionGrid columns={3}>{arrowheadOptions.map(({ value, label }) => <Choice key={`start-${label}`} label={`Start ${label}`} active={startArrowhead === value} onClick={() => updateArrowhead("start", value)}><NativeArrowheadIcon value={value} flip /></Choice>)}</OptionGrid></Section>
            <Section label="End arrowhead" mixed={mixedStyles.has("endArrowhead")}><OptionGrid columns={3}>{arrowheadOptions.map(({ value, label }) => <Choice key={`end-${label}`} label={`End ${label}`} active={endArrowhead === value} onClick={() => updateArrowhead("end", value)}><NativeArrowheadIcon value={value} /></Choice>)}</OptionGrid></Section>
          </div>
        )}

        {openPanel === "text" && (
          <div className="grid gap-4">
            <Section label="Font family" mixed={mixedStyles.has("fontFamily")}><div className="grid gap-1">{fontFamilyOptions.map(({ value, label }) => <button key={label} type="button" className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent", fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}><span className="w-5 text-center text-[12px]">Aa</span><span>{label}</span></button>)}</div></Section>
            <Section label="Font size" mixed={mixedStyles.has("fontSize")}><OptionGrid columns={4}>{fontSizeOptions.map((value) => <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[9px] font-medium tabular-nums">{value}</span></Choice>)}</OptionGrid></Section>
            <Section label="Text align" mixed={mixedStyles.has("textAlign")}><OptionGrid columns={3}>{textAlignOptions.map(({ value, label }) => <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><NativeTextAlignIcon value={value} /></Choice>)}</OptionGrid></Section>
          </div>
        )}

        {openPanel === "more" && (
          <div className="grid gap-2">
            {hasOverflowProperties && <Section label="Properties">
              <div className="grid gap-0.5">
                {showColors && !quickIds.has("color") && <PropertyMenuAction label="Colors" onClick={togglePanel("color")} />}
                {shapeProperties && !quickIds.has("properties") && <PropertyMenuAction label={propertiesLabel} onClick={togglePanel("properties")} />}
                {showArrow && !quickIds.has("arrow") && <PropertyMenuAction label="Arrow properties" onClick={togglePanel("arrow")} />}
                {showText && !quickIds.has("text") && <PropertyMenuAction label="Text properties" onClick={togglePanel("text")} />}
                {showLinearEditor && !quickIds.has("line") && <MenuRowAction api={api} name="toggleLinearEditor" label="Edit line" onClick={() => runAndClose("toggleLinearEditor")} />}
              </div>
            </Section>}
            <Section label="Edit">
              <div className="grid gap-0.5">
                {!quickIds.has("duplicate") && <MenuRowAction api={api} name="duplicateSelection" label="Duplicate" disabled={!hasSelection} onClick={() => runAndClose("duplicateSelection")} />}
                <MenuRowAction api={api} name="deleteSelectedElements" label="Delete" danger disabled={!hasSelection} onClick={() => runAndClose("deleteSelectedElements")} />
              </div>
            </Section>
            {selectedEmbed && (
              <Section label="Embed">
                <div className="grid gap-0.5">
                  <button type="button" className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent [&_svg]:size-4" onClick={() => runAndClose("hyperlink")}>
                    <NativeEmbedIcon /><span>Edit embed URL</span>
                  </button>
                  {selectedEmbed.link && (
                    <button type="button" className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent [&_svg]:size-4" onClick={() => { void openExternalUrl(selectedEmbed.link!); closePanel(); }}>
                      <NativeEmbedIcon /><span>Open embed source</span>
                    </button>
                  )}
                </div>
              </Section>
            )}
            {(selectedElementCount > 1 || nativeActionAvailable(api, "ungroup")) && <Section label="Group">
              <div className="grid gap-0.5">
                <MenuRowAction api={api} name="group" label="Group selection" disabled={selectedElementCount < 2} onClick={() => runAndClose("group")} />
                {nativeActionAvailable(api, "ungroup") && <MenuRowAction api={api} name="ungroup" label="Ungroup" onClick={() => runAndClose("ungroup")} />}
              </div>
            </Section>}
            <Section label="Layer">
              <div className="grid gap-0.5">
                <MenuRowAction api={api} name="sendToBack" label="Send to back" onClick={() => runAndClose("sendToBack")} />
                <MenuRowAction api={api} name="sendBackward" label="Send backward" onClick={() => runAndClose("sendBackward")} />
                <MenuRowAction api={api} name="bringForward" label="Bring forward" onClick={() => runAndClose("bringForward")} />
                <MenuRowAction api={api} name="bringToFront" label="Bring to front" onClick={() => runAndClose("bringToFront")} />
              </div>
            </Section>
            {selectedElementCount >= 2 && (
              <Section label="Align & distribute">
                <div className="grid gap-0.5">
                  <MenuRowAction api={api} name="alignLeft" label="Align left" onClick={() => runAndClose("alignLeft")} />
                  <MenuRowAction api={api} name="alignHorizontallyCentered" label="Align center" onClick={() => runAndClose("alignHorizontallyCentered")} />
                  <MenuRowAction api={api} name="alignRight" label="Align right" onClick={() => runAndClose("alignRight")} />
                  <MenuRowAction api={api} name="alignTop" label="Align top" onClick={() => runAndClose("alignTop")} />
                  <MenuRowAction api={api} name="alignVerticallyCentered" label="Align middle" onClick={() => runAndClose("alignVerticallyCentered")} />
                  <MenuRowAction api={api} name="alignBottom" label="Align bottom" onClick={() => runAndClose("alignBottom")} />
                  <MenuRowAction api={api} name="distributeHorizontally" label="Distribute horizontally" disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeHorizontally")} />
                  <MenuRowAction api={api} name="distributeVertically" label="Distribute vertically" disabled={selectedElementCount < 3} onClick={() => runAndClose("distributeVertically")} />
                </div>
              </Section>
            )}
            <Section label="Transform & reuse">
              <div className="grid gap-0.5">
                <MenuRowAction api={api} name="flipHorizontal" label="Flip horizontal" disabled={!hasSelection} onClick={() => runAndClose("flipHorizontal")} />
                <MenuRowAction api={api} name="flipVertical" label="Flip vertical" disabled={!hasSelection} onClick={() => runAndClose("flipVertical")} />
                <MenuRowAction api={api} name="toggleElementLock" label={selectedElements.every((element) => element.locked) ? "Unlock selection" : "Lock selection"} disabled={!hasSelection} onClick={() => runAndClose("toggleElementLock")} />
                <MenuRowAction api={api} name="wrapSelectionInFrame" label="Wrap in frame" disabled={!hasSelection} onClick={() => runAndClose("wrapSelectionInFrame")} />
                <MenuRowAction api={api} name="addToLibrary" label="Add to library" disabled={!hasSelection} onClick={() => runAndClose("addToLibrary")} />
              </div>
            </Section>
          </div>
        )}
        </motion.div>
      </div>
    );
  };

  const linearEditorIcon = showLinearEditor ? nativeActionIcon(api, "toggleLinearEditor") : null;
  const showColors = showStroke || showFill;
  const quickSelectionActions = [
    showColors ? <ColorTrigger key="color" strokeColor={strokeColor} fillColor={backgroundColor} showStroke={showStroke} showFill={showFill} open={openPanel === "color"} onClick={togglePanel("color")} /> : null,
    selectedEmbed ? <CompactButton key="embed" label={embedInteractive ? "Lock embed" : "Interact with embed"} open={embedInteractive} onClick={toggleEmbedInteraction}><NativeEmbedIcon /></CompactButton> : null,
    showArrow ? <CompactButton key="arrow" label="Arrow properties" open={openPanel === "arrow"} onClick={togglePanel("arrow")}><NativeArrowTypeIcon type={arrowType ?? "sharp"} /></CompactButton> : null,
    showLinearEditor ? <CompactButton key="line" label="Edit line" onClick={() => onAction("toggleLinearEditor")}>{linearEditorIcon ? <span className="grid place-items-center [&_svg]:size-4">{linearEditorIcon}</span> : <NativePencilIcon />}</CompactButton> : null,
    showText ? <CompactButton key="text" label="Text properties" open={openPanel === "text"} onClick={togglePanel("text")}><NativeTextSizeIcon /></CompactButton> : null,
    shapeProperties ? <CompactButton key="properties" label={propertiesLabel} open={openPanel === "properties"} onClick={togglePanel("properties")}><NativeAdjustmentsIcon /></CompactButton> : null,
    hasSelection ? <CompactButton key="duplicate" label="Duplicate" onClick={() => onAction("duplicateSelection")}>{nativeActionIcon(api, "duplicateSelection") ?? <NativeDotsHorizontalIcon />}</CompactButton> : null,
  ].filter((control) => control !== null).slice(0, 3);
  const quickIds = new Set(quickSelectionActions.map((control) => control.key));
  const hasOverflowProperties = [["color", showColors], ["properties", shapeProperties], ["arrow", showArrow], ["text", showText], ["line", showLinearEditor]]
    .some(([id, available]) => available && !quickIds.has(String(id)));

  return (
    <div
      ref={rootRef}
      data-context={hasSelection ? "selection" : "tool"}
      className={cn("notespace-selection-actions pointer-events-auto relative z-[1] flex w-fit max-w-[calc(100vw-16px)] min-w-0 items-center gap-0.5 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none [&~_.excalidraw_.mobile-shape-actions]:!hidden", vertical ? "flex-col" : "h-10 flex-row")}
      style={{ visibility: shouldShow ? undefined : "hidden" }}
      aria-hidden={!shouldShow}
      role="toolbar"
      aria-label={hasSelection ? "Selected shape actions" : `${canvasToolName(activeTool)} tool settings`}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        const keys = vertical ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
        if (openPanel || !keys.includes(event.key) || !(event.target instanceof HTMLButtonElement) || event.target.closest('[role="dialog"]')) return;
        const controls = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const current = controls.indexOf(event.target);
        if (current < 0) return;
        event.preventDefault();
        controls[(current + (event.key === keys[1] ? 1 : -1) + controls.length) % controls.length]?.focus();
      }}
      onKeyDownCapture={(event) => {
        if (openPanel && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
          closePanel();
          if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
          return;
        }
        if (!openPanel || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
      }}
      onKeyUpCapture={(event) => {
        if (!openPanel || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
      }}
    >
      {renderPanel()}
      {selectedElementCount > 1 && <span className="shrink-0 px-1 text-[10px] text-muted">{selectedElementCount} selected</span>}
      <div className={cn("flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", vertical && "flex-col")}>
        {quickSelectionActions}
      </div>
      {hasSelection && (
        <div className="shrink-0 border-l border-line pl-0.5">
          <CompactButton label="More selected shape actions" open={openPanel === "more"} onClick={togglePanel("more")}><NativeDotsHorizontalIcon /></CompactButton>
        </div>
      )}
    </div>
  );
}
