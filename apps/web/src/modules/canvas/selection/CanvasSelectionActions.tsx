import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEventHandler } from "react";
import { cn } from "../../../shared/ui";
import { useDismissablePopup } from "../../../shared/ui/overlays/dismissable";
import {
  NativeAdjustmentsIcon,
  NativeEdgeIcon,
  NativeFillIcon,
  NativePressureIcon,
  NativeSloppinessIcon,
  NativeStrokeStyleIcon,
  NativeStrokeWidthIcon,
  NativeTextAlignIcon,
  NativeTextSizeIcon,
} from "../core/excalidraw-bridge/CanvasNativeIcons";
import type { CanvasActionName } from "../core/excalidraw-bridge/canvas-action-names";
import { canvasToolName } from "../chrome/canvas-tool-catalog";
import { Choice, Section, OptionGrid, OpacityControl, CompactButton, ColorTrigger, ColorSwatches } from "./CanvasSelectionControls";
import { selectionPanelPosition, type PanelLayout } from "./canvas-selection-position";
import {
  applyCanvasStylePatch,
  bucketFillColorOptions,
  fillColorOptions,
  fillStyleOptions,
  fontFamilyOptions,
  fontSizeOptions,
  readCanvasStyles,
  roughnessOptions,
  selectionContext,
  strokeColorOptions,
  strokeStyleOptions,
  strokeWidthOptions,
  textAlignOptions,
  type StylePatch,
} from "./canvas-selection-styles";

export type CanvasRuntimeActionName = CanvasActionName | "toggleLinearEditor" | "hyperlink";

type Panel = "color" | "properties" | "text";

const inactiveTools = new Set<AppState["activeTool"]["type"]>(["selection", "eraser", "hand", "laser", "lasso"]);

export function CanvasSelectionActions({
  api,
  activeTool,
  isManipulating = false,
  contextMenuOpen = false,
  viewModeEnabled = false,
  onOverlayOpen,
  onOverlayClose,
  overlayActive = true,
}: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  isManipulating?: boolean;
  contextMenuOpen?: boolean;
  viewModeEnabled?: boolean;
  onOverlayOpen?: () => void;
  onOverlayClose?: () => void;
  overlayActive?: boolean;
}) {
  const [, refresh] = useState(0);
  const context = selectionContext(api, activeTool);
  const { appState, selectedElements, capabilities, shapeEditing, lineEditing, freeDrawEditing, textEditing, bucketFillEditing } = context;
  const hasStyleContext = capabilities.opacity !== "none" || shapeEditing || lineEditing || freeDrawEditing || textEditing || bucketFillEditing;
  const hasContext = !inactiveTools.has(activeTool) && hasStyleContext;
  const contextKey = `tool:${activeTool}`;
  const [panelState, setPanelState] = useState<{ panel: Panel; contextKey: string } | null>(null);
  const openPanel = panelState?.contextKey === contextKey ? panelState.panel : null;
  const [compact, setCompact] = useState(false);
  const vertical = !compact;
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
  }, [openPanel, updatePanelLayout]);

  const shouldShow = !viewModeEnabled && !contextMenuOpen && !isManipulating && hasContext;
  if (!api || !appState || !hasContext) return null;

  const {
    mixedStyles, strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, roundness,
    pressure, opacity, fontFamily, fontSize, textAlign,
  } = readCanvasStyles(selectedElements, activeTool, appState);

  const updateStyle = (patch: StylePatch) => {
    applyCanvasStylePatch(api, context, activeTool, patch);
    refresh((value) => value + 1);
  };

  const togglePanel = (panel: Panel): MouseEventHandler<HTMLButtonElement> => (event) => {
    if (!event.currentTarget.closest('[role="dialog"]')) triggerRef.current = event.currentTarget;
    const nextPanel = openPanel === panel ? null : panel;
    setPanelState(nextPanel ? { panel: nextPanel, contextKey } : null);
    if (nextPanel) onOverlayOpen?.();
    else onOverlayClose?.();
  };

  const shapeProperties = shapeEditing || lineEditing || freeDrawEditing || textEditing || bucketFillEditing || capabilities.stroke === "all" || capabilities.opacity === "all";
  const showStroke = !bucketFillEditing && (shapeProperties || textEditing);
  const showFill = bucketFillEditing || shapeEditing || capabilities.fill === "all";
  const showText = textEditing;
  const showAdditionalDrawingOptions = shapeEditing || lineEditing || freeDrawEditing || capabilities.fill !== "none" || capabilities.line !== "none" || capabilities.freeDraw !== "none";
  const propertiesLabel = `${canvasToolName(activeTool)} settings`;

  const renderPanel = () => {
    if (!openPanel || typeof document === "undefined") return null;
    return (
      <div
        key={openPanel}
        ref={panelRef}
        className="no-scrollbar absolute z-[var(--z-popover)] max-h-[min(42dvh,320px)] w-max max-w-[calc(100vw-24px)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-line bg-surface text-ink [box-shadow:var(--shadow-float)]"
        style={{ left: panelLayout?.left ?? 0, top: panelLayout?.top ?? 0, visibility: panelLayout ? "visible" : "hidden" }}
        data-placement={panelLayout?.placement}
        role="dialog"
        aria-label={openPanel === "properties" ? propertiesLabel : `${openPanel} properties`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16, ease: "easeOut" }} className="p-2">
          <p className="mb-2 text-[10px] font-medium text-muted">{propertiesLabel}</p>
          {openPanel === "color" && (
            <div className="grid gap-2.5">
              {showStroke && <Section label="Stroke color" mixed={mixedStyles.has("strokeColor")}><ColorSwatches colors={strokeColorOptions} current={strokeColor} label="Stroke color" onChange={(color) => updateStyle({ strokeColor: color })} /></Section>}
              {showFill && <Section label="Fill color" mixed={mixedStyles.has("backgroundColor")}><ColorSwatches colors={bucketFillEditing ? bucketFillColorOptions : fillColorOptions} current={backgroundColor} label="Fill color" onChange={(color) => updateStyle({ backgroundColor: color })} /></Section>}
            </div>
          )}

          {openPanel === "properties" && (
            <div className="grid gap-2">
              {showFill && <Section label="Fill" mixed={mixedStyles.has("fillStyle")}><OptionGrid columns={3}>{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><NativeFillIcon value={value} /></Choice>)}</OptionGrid></Section>}
              {!bucketFillEditing && showStroke && <Section label="Stroke width" mixed={mixedStyles.has("strokeWidth")}><OptionGrid columns={3}>{strokeWidthOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeWidth === value} onClick={() => updateStyle({ strokeWidth: value })}><NativeStrokeWidthIcon value={value} /></Choice>)}</OptionGrid></Section>}
              <Section label="Opacity" mixed={mixedStyles.has("opacity")}><OpacityControl value={opacity} onChange={(value) => updateStyle({ opacity: value })} /></Section>
              {showAdditionalDrawingOptions && (
                <div className="grid gap-2 border-t border-line pt-2">
                  {!showFill && capabilities.fill === "some" && <Section label="Fill · shapes" mixed={mixedStyles.has("fillStyle")}><OptionGrid columns={3}>{fillStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}><NativeFillIcon value={value} /></Choice>)}</OptionGrid></Section>}
                  {(shapeEditing || lineEditing || capabilities.fill !== "none" || capabilities.line !== "none") && <Section label={capabilities.mixed ? "Stroke pattern · shapes and lines" : "Stroke pattern"} mixed={mixedStyles.has("strokeStyle")}><OptionGrid columns={3}>{strokeStyleOptions.map(({ value, label }) => <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}><NativeStrokeStyleIcon value={value} /></Choice>)}</OptionGrid></Section>}
                  {(shapeEditing || lineEditing || capabilities.fill !== "none" || capabilities.line !== "none") && <Section label={capabilities.mixed ? "Line feel · shapes and lines" : "Line feel"} mixed={mixedStyles.has("roughness")}><OptionGrid columns={3}>{roughnessOptions.map(({ value, label }) => <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}><NativeSloppinessIcon value={value} /></Choice>)}</OptionGrid></Section>}
                  {(shapeEditing || capabilities.fill !== "none") && <Section label={capabilities.mixed ? "Corners · shapes" : "Corners"} mixed={mixedStyles.has("roundness")}><OptionGrid columns={2}><Choice label="Sharp corners" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}><NativeEdgeIcon value="sharp" /></Choice><Choice label="Rounded corners" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}><NativeEdgeIcon value="round" /></Choice></OptionGrid></Section>}
                  {(freeDrawEditing || capabilities.freeDraw !== "none") && <Section label={capabilities.mixed ? "Pressure · pen" : "Pressure"} mixed={mixedStyles.has("pressure")}><OptionGrid columns={2}><Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}><NativePressureIcon value="constant" /></Choice><Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}><NativePressureIcon value="variable" /></Choice></OptionGrid></Section>}
                </div>
              )}
            </div>
          )}

          {openPanel === "text" && (
            <div className="grid gap-4">
              <Section label="Font family" mixed={mixedStyles.has("fontFamily")}><div className="grid gap-1">{fontFamilyOptions.map(({ value, label }) => <button key={label} type="button" className={cn("flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] hover:bg-tint hover:text-accent", fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}><span className="w-5 text-center text-[12px]">Aa</span><span>{label}</span></button>)}</div></Section>
              <Section label="Font size" mixed={mixedStyles.has("fontSize")}><OptionGrid columns={4}>{fontSizeOptions.map((value) => <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}><span className="text-[9px] font-medium tabular-nums">{value}</span></Choice>)}</OptionGrid></Section>
              <Section label="Text align" mixed={mixedStyles.has("textAlign")}><OptionGrid columns={3}>{textAlignOptions.map(({ value, label }) => <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}><NativeTextAlignIcon value={value} /></Choice>)}</OptionGrid></Section>
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  const showColors = showStroke || showFill;
  const quickToolActions = [
    showColors ? <ColorTrigger key="color" strokeColor={strokeColor} fillColor={backgroundColor} showStroke={showStroke} showFill={showFill} open={openPanel === "color"} onClick={togglePanel("color")} /> : null,
    showText ? <CompactButton key="text" label="Text properties" open={openPanel === "text"} onClick={togglePanel("text")}><NativeTextSizeIcon /></CompactButton> : null,
    shapeProperties ? <CompactButton key="properties" label={propertiesLabel} open={openPanel === "properties"} onClick={togglePanel("properties")}><NativeAdjustmentsIcon /></CompactButton> : null,
  ].filter((control) => control !== null).slice(0, 3);

  return (
    <div
      ref={rootRef}
      data-context="tool"
      className={cn("notespace-selection-actions pointer-events-auto relative z-[1] flex w-fit max-w-[calc(100vw-16px)] min-w-0 items-center gap-0.5 overflow-visible rounded-lg border border-line bg-surface p-1 [box-shadow:var(--shadow-float)] [&~_.excalidraw_.mobile-shape-actions]:!hidden", vertical ? "flex-col" : "h-10 flex-row")}
      style={{ visibility: shouldShow ? undefined : "hidden" }}
      aria-hidden={!shouldShow}
      role="toolbar"
      aria-label={propertiesLabel}
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
      <div className={cn("no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto", vertical && "flex-col")}>
        {quickToolActions}
      </div>
    </div>
  );
}
