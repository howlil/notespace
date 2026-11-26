import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  AlignHorizontalJustifyCenter,
  ArrowUpRight,
  Check,
  FolderPlus,
  Layers,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Palette,
  ScanSearch,
  Type,
  Ungroup,
} from "lucide-react";
import { useState } from "react";
import { openExternalUrl } from "../../../platform/runtime/external-links";
import { cn } from "../../../shared/ui";
import { executeNativeAction, nativeActionAvailable, nativeActionIcon } from "../core/excalidraw-bridge/CanvasNativeActions";
import {
  NativeArrowheadIcon,
  NativeArrowTypeIcon,
  NativeDotsHorizontalIcon,
  NativeEdgeIcon,
  NativeEmbedIcon,
  NativeFillIcon,
  NativePencilIcon,
  NativePressureIcon,
  NativeSloppinessIcon,
  NativeStrokeStyleIcon,
  NativeStrokeWidthIcon,
  NativeTextAlignIcon,
} from "../core/excalidraw-bridge/CanvasNativeIcons";
import { isFrameElement, readCanvasFrameStyle, withCanvasFrameStyle, type CanvasFrameStyle } from "../objects/frame/canvas-frame-style";
import { Choice, ColorSwatches, OpacityControl, OptionGrid, Section } from "./CanvasSelectionControls";
import type { CanvasRuntimeActionName } from "./CanvasSelectionActions";
import {
  applyArrowhead,
  applyArrowType,
  applyCanvasStylePatch,
  arrowheadOptions,
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
import {
  MenuActionRow,
  MenuDivider,
  MenuSectionHeader,
  NativeMenuRow,
  SubmenuItem,
  rowClass,
  segmentedBtnClass,
} from "./ContextMenuPrimitives";

export function SelectionMenuBody({
  api,
  activeTool,
  selectedElementCount,
  sectionActions,
  openSub,
  setOpenSub,
  onAction,
  onClose,
}: {
  api: ExcalidrawImperativeAPI;
  activeTool: AppState["activeTool"]["type"];
  selectedElementCount: number;
  sectionActions?: {
    onCreateSection: () => void;
    onFitSection: (frameId: string) => void;
    onTidySection: (frameId: string) => void;
    onUngroupSection: (frameId: string) => void;
  };
  openSub: string | null;
  setOpenSub: (id: string | null) => void;
  onAction: (name: CanvasRuntimeActionName) => void;
  onClose: () => void;
}) {
  const [, refresh] = useState(0);
  const context = selectionContext(api, activeTool);
  const { appState, selectedElements, capabilities, selectedArrow, selectedText, selectedEmbed, shapeEditing, lineEditing, freeDrawEditing, textEditing } = context;
  if (!appState || selectedElements.length === 0) return null;

  const {
    mixedStyles, strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle,
    roughness, roundness, pressure, opacity, startArrowhead, endArrowhead, arrowType,
    fontFamily, fontSize, textAlign,
  } = readCanvasStyles(selectedElements, activeTool, appState);

  const updateStyle = (patch: StylePatch) => {
    applyCanvasStylePatch(api, context, activeTool, patch);
    refresh((value) => value + 1);
  };

  const runAndClose = (name: CanvasRuntimeActionName) => {
    onAction(name);
    onClose();
  };

  const runNativeAndClose = (name: string) => {
    executeNativeAction(api, name);
    onClose();
  };

  const shapeProperties = shapeEditing || lineEditing || freeDrawEditing || textEditing || capabilities.stroke === "all" || capabilities.opacity === "all";
  const showStroke = capabilities.stroke === "all";
  const showFill = capabilities.fill === "all";
  const showArrow = capabilities.arrow === "all" && Boolean(selectedArrow);
  const showText = capabilities.text === "all" && Boolean(selectedText);
  const showLinearEditor = Boolean(capabilities.line === "all" && !capabilities.mixed);
  const showAdditionalDrawingOptions = shapeEditing || lineEditing || freeDrawEditing || capabilities.fill !== "none" || capabilities.line !== "none" || capabilities.freeDraw !== "none";
  const showInlineStrokeWidth = showStroke && !textEditing;
  const embedInteractive = Boolean(selectedEmbed && appState.activeEmbeddable?.element.id === selectedEmbed.id && appState.activeEmbeddable.state === "active");
  const allLocked = selectedElements.every((element) => element.locked);

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
    } else {
      api.updateScene({
        appState: { activeEmbeddable: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
    onClose();
  };

  const allFrames = selectedElements.length > 0 && selectedElements.every((element) => isFrameElement(element));
  const frameOutlineColors = ["transparent", "#e03131", "#2f9e44", "#1971c2", "#f08c00"] as const;
  const currentFrameStyle = allFrames ? readCanvasFrameStyle(selectedElements[0]) : null;
  const frameStrokeColor = allFrames ? (currentFrameStyle?.strokeColor ?? "transparent") : undefined;
  const frameBgColor = allFrames ? (currentFrameStyle?.backgroundColor ?? "transparent") : undefined;

  const updateFrameStyle = (patch: Partial<CanvasFrameStyle>) => {
    const selectedIds = new Set(selectedElements.map((element) => element.id));
    const elements = api.getSceneElements().map((element) => {
      if (!selectedIds.has(element.id) || !isFrameElement(element)) return element;
      return newElementWith(element, {
        customData: withCanvasFrameStyle(element.customData, patch),
      });
    });
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    refresh((value) => value + 1);
  };

  const selectionTitle = allFrames
    ? (selectedElementCount > 1 ? `${selectedElementCount} frames` : "Frame")
    : selectedElementCount > 1
      ? `${selectedElementCount} selected`
      : showArrow
        ? "Arrow"
        : showText
          ? "Text"
          : freeDrawEditing
            ? "Drawing"
            : lineEditing
              ? "Line"
              : selectedEmbed
                ? "Embed"
                : "Shape";

  return (
    <>
      {allFrames && (
        <>
          <div className="grid gap-1.5 px-1.5 pt-1 pb-1.5" onMouseEnter={() => setOpenSub(null)}>
            <MenuSectionHeader title={selectionTitle} />
            <div className="grid gap-1">
              <span className="text-[10px] font-medium text-muted">Outline</span>
              <ColorSwatches colors={frameOutlineColors} current={frameStrokeColor} label="Frame outline color" onChange={(color) => updateFrameStyle({ strokeColor: color })} />
            </div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between text-[10px] font-medium text-muted">
                <span>Background</span>
                <span className="text-[10px] font-normal tabular-nums text-muted/80">50%</span>
              </div>
              <ColorSwatches colors={fillColorOptions} current={frameBgColor} label="Frame background color" onChange={(color) => updateFrameStyle({ backgroundColor: color })} />
            </div>
          </div>
          {sectionActions && selectedElements.length === 1 && (
            <>
              <MenuDivider />
              <MenuActionRow
                icon={<LayoutGrid className="size-3.5" />}
                label="Tidy section"
                onHover={() => setOpenSub(null)}
                onClick={() => { sectionActions.onTidySection(selectedElements[0].id); onClose(); }}
              />
              <MenuActionRow
                icon={<ScanSearch className="size-3.5" />}
                label="Fit section to content"
                onHover={() => setOpenSub(null)}
                onClick={() => { sectionActions.onFitSection(selectedElements[0].id); onClose(); }}
              />
              <MenuActionRow
                icon={<Ungroup className="size-3.5" />}
                label="Ungroup section"
                onHover={() => setOpenSub(null)}
                onClick={() => { sectionActions.onUngroupSection(selectedElements[0].id); onClose(); }}
              />
            </>
          )}
          <MenuDivider />
        </>
      )}
      {!allFrames && (showStroke || showFill || showInlineStrokeWidth) && (
        <>
          <div className="grid gap-1.5 px-1.5 pt-1 pb-1.5" onMouseEnter={() => setOpenSub(null)}>
            <MenuSectionHeader title={selectionTitle} />
            {showStroke && (
              <div className="grid gap-1">
                <span className="text-[10px] font-medium text-muted">Stroke</span>
                <ColorSwatches colors={strokeColorOptions} current={strokeColor} label="Stroke color" onChange={(color) => updateStyle({ strokeColor: color })} />
              </div>
            )}
            {showFill && (
              <div className="grid gap-1">
                <span className="text-[10px] font-medium text-muted">Fill</span>
                <ColorSwatches colors={fillColorOptions} current={backgroundColor} label="Fill color" onChange={(color) => updateStyle({ backgroundColor: color })} />
              </div>
            )}
            {showInlineStrokeWidth && (
              <div className="grid gap-1">
                <span className="text-[10px] font-medium text-muted">Width</span>
                <div className="grid grid-cols-3 gap-1" role="group" aria-label="Stroke width">
                  {strokeWidthOptions.map(({ value, label }) => {
                    const active = strokeWidth === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-label={label}
                        aria-pressed={active}
                        title={label}
                        className={cn(
                          segmentedBtnClass,
                          active ? "border-accent bg-tint text-accent" : "border-line bg-canvas text-ink hover:bg-tint hover:text-accent",
                        )}
                        onClick={() => updateStyle({ strokeWidth: value })}
                      >
                        <NativeStrokeWidthIcon value={value} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <MenuDivider />
        </>
      )}

      {shapeProperties && (
        <SubmenuItem id="style" openId={openSub} icon={<Palette className="size-3.5" />} label="Style" panelClassName="w-max max-w-[min(240px,calc(100vw-24px))] p-2" onOpen={setOpenSub}>
          <div className="grid gap-2">
            {showFill && (
              <Section label="Fill style" mixed={mixedStyles.has("fillStyle")}>
                <OptionGrid columns={3}>
                  {fillStyleOptions.map(({ value, label }) => (
                    <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}>
                      <NativeFillIcon value={value} />
                    </Choice>
                  ))}
                </OptionGrid>
              </Section>
            )}
            <Section label="Opacity" mixed={mixedStyles.has("opacity")}>
              <OpacityControl value={opacity} onChange={(value) => updateStyle({ opacity: value })} />
            </Section>
            {showAdditionalDrawingOptions && (
              <div className="grid gap-3 border-t border-line pt-2.5">
                {!showFill && capabilities.fill === "some" && (
                  <Section label="Fill · shapes" mixed={mixedStyles.has("fillStyle")}>
                    <OptionGrid columns={3}>
                      {fillStyleOptions.map(({ value, label }) => (
                        <Choice key={value} label={label} active={fillStyle === value} onClick={() => updateStyle({ fillStyle: value })}>
                          <NativeFillIcon value={value} />
                        </Choice>
                      ))}
                    </OptionGrid>
                  </Section>
                )}
                {(shapeEditing || lineEditing || capabilities.fill !== "none" || capabilities.line !== "none") && (
                  <Section label="Stroke pattern" mixed={mixedStyles.has("strokeStyle")}>
                    <OptionGrid columns={3}>
                      {strokeStyleOptions.map(({ value, label }) => (
                        <Choice key={value} label={label} active={strokeStyle === value} onClick={() => updateStyle({ strokeStyle: value })}>
                          <NativeStrokeStyleIcon value={value} />
                        </Choice>
                      ))}
                    </OptionGrid>
                  </Section>
                )}
                {(shapeEditing || lineEditing || capabilities.fill !== "none" || capabilities.line !== "none") && (
                  <Section label="Line feel" mixed={mixedStyles.has("roughness")}>
                    <OptionGrid columns={3}>
                      {roughnessOptions.map(({ value, label }) => (
                        <Choice key={value} label={label} active={roughness === value} onClick={() => updateStyle({ roughness: value })}>
                          <NativeSloppinessIcon value={value} />
                        </Choice>
                      ))}
                    </OptionGrid>
                  </Section>
                )}
                {(shapeEditing || capabilities.fill !== "none") && (
                  <Section label="Corners" mixed={mixedStyles.has("roundness")}>
                    <OptionGrid columns={2}>
                      <Choice label="Sharp corners" active={roundness === "sharp"} onClick={() => updateStyle({ roundness: "sharp" })}>
                        <NativeEdgeIcon value="sharp" />
                      </Choice>
                      <Choice label="Rounded corners" active={roundness === "round"} onClick={() => updateStyle({ roundness: "round" })}>
                        <NativeEdgeIcon value="round" />
                      </Choice>
                    </OptionGrid>
                  </Section>
                )}
                {(freeDrawEditing || capabilities.freeDraw !== "none") && (
                  <Section label="Pressure" mixed={mixedStyles.has("pressure")}>
                    <OptionGrid columns={2}>
                      <Choice label="Constant pressure" active={pressure === "constant"} onClick={() => updateStyle({ pressure: "constant" })}>
                        <NativePressureIcon value="constant" />
                      </Choice>
                      <Choice label="Variable pressure" active={pressure === "variable"} onClick={() => updateStyle({ pressure: "variable" })}>
                        <NativePressureIcon value="variable" />
                      </Choice>
                    </OptionGrid>
                  </Section>
                )}
              </div>
            )}
          </div>
        </SubmenuItem>
      )}

      {showArrow && (
        <SubmenuItem id="arrow" openId={openSub} icon={<ArrowUpRight className="size-3.5" />} label="Arrow" panelClassName="w-max max-w-[min(240px,calc(100vw-24px))] p-2" onOpen={setOpenSub}>
          <div className="grid gap-3">
            <Section label="Arrow type" mixed={mixedStyles.has("arrowType")}>
              <OptionGrid columns={3}>
                {(["sharp", "round", "elbow"] as const).map((value) => (
                  <Choice key={value} label={value === "sharp" ? "Sharp arrow" : value === "round" ? "Curved arrow" : "Elbow arrow"} active={arrowType === value} onClick={() => { applyArrowType(api, context, activeTool, value); refresh((v) => v + 1); }}>
                    <NativeArrowTypeIcon type={value} />
                  </Choice>
                ))}
              </OptionGrid>
            </Section>
            <Section label="Start arrowhead" mixed={mixedStyles.has("startArrowhead")}>
              <OptionGrid columns={3}>
                {arrowheadOptions.map(({ value, label }) => (
                  <Choice key={`start-${label}`} label={`Start ${label}`} active={startArrowhead === value} onClick={() => { applyArrowhead(api, context, activeTool, "start", value); refresh((v) => v + 1); }}>
                    <NativeArrowheadIcon value={value} flip />
                  </Choice>
                ))}
              </OptionGrid>
            </Section>
            <Section label="End arrowhead" mixed={mixedStyles.has("endArrowhead")}>
              <OptionGrid columns={3}>
                {arrowheadOptions.map(({ value, label }) => (
                  <Choice key={`end-${label}`} label={`End ${label}`} active={endArrowhead === value} onClick={() => { applyArrowhead(api, context, activeTool, "end", value); refresh((v) => v + 1); }}>
                    <NativeArrowheadIcon value={value} />
                  </Choice>
                ))}
              </OptionGrid>
            </Section>
          </div>
        </SubmenuItem>
      )}

      {showText && (
        <SubmenuItem id="text" openId={openSub} icon={<Type className="size-3.5" />} label="Text" panelClassName="w-max max-w-[min(240px,calc(100vw-24px))] p-2" onOpen={setOpenSub}>
          <div className="grid gap-3">
            <Section label="Font family" mixed={mixedStyles.has("fontFamily")}>
              <div className="grid gap-0.5">
                {fontFamilyOptions.map(({ value, label }) => (
                  <button key={label} type="button" className={cn(rowClass, fontFamily === value && "bg-tint text-accent")} aria-pressed={fontFamily === value} onClick={() => updateStyle({ fontFamily: value })}>
                    <span className="w-5 text-center text-[12px]">Aa</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </Section>
            <Section label="Font size" mixed={mixedStyles.has("fontSize")}>
              <OptionGrid columns={4}>
                {fontSizeOptions.map((value) => (
                  <Choice key={value} label={`Font size ${value}`} active={fontSize === value} onClick={() => updateStyle({ fontSize: value })}>
                    <span className="text-[10px] font-medium tabular-nums">{value}</span>
                  </Choice>
                ))}
              </OptionGrid>
            </Section>
            <Section label="Text align" mixed={mixedStyles.has("textAlign")}>
              <OptionGrid columns={3}>
                {textAlignOptions.map(({ value, label }) => (
                  <Choice key={value} label={label} active={textAlign === value} onClick={() => updateStyle({ textAlign: value })}>
                    <NativeTextAlignIcon value={value} />
                  </Choice>
                ))}
              </OptionGrid>
            </Section>
          </div>
        </SubmenuItem>
      )}

      {selectedEmbed && (
        <>
          <MenuActionRow icon={<NativeEmbedIcon className="size-3.5" />} label={embedInteractive ? "Lock embed" : "Interact with embed"} onHover={() => setOpenSub(null)} onClick={toggleEmbedInteraction} />
          <MenuActionRow icon={<NativeEmbedIcon className="size-3.5" />} label="Edit embed URL" onHover={() => setOpenSub(null)} onClick={() => runAndClose("hyperlink")} />
          {selectedEmbed.link && (
            <MenuActionRow icon={<NativeEmbedIcon className="size-3.5" />} label="Open embed source" onHover={() => setOpenSub(null)} onClick={() => { void openExternalUrl(selectedEmbed.link!); onClose(); }} />
          )}
        </>
      )}

      {showLinearEditor && (
        <MenuActionRow
          icon={nativeActionIcon(api, "toggleLinearEditor") ?? <NativePencilIcon className="size-3.5" />}
          label="Edit line"
          onHover={() => setOpenSub(null)}
          onClick={() => runAndClose("toggleLinearEditor")}
        />
      )}

      <MenuDivider />

      <NativeMenuRow api={api} name="duplicateSelection" label="Duplicate" shortcut="Ctrl+D" onHover={() => setOpenSub(null)} onRun={runAndClose} />
      {nativeActionAvailable(api, "copyStyles") && (
        <NativeMenuRow api={api} name="copyStyles" label="Copy styles" shortcut="Ctrl+Alt+C" onHover={() => setOpenSub(null)} onRun={runAndClose} />
      )}
      {nativeActionAvailable(api, "pasteStyles") && (
        <NativeMenuRow api={api} name="pasteStyles" label="Paste styles" shortcut="Ctrl+Alt+V" onHover={() => setOpenSub(null)} onRun={runAndClose} />
      )}

      {(selectedElementCount > 1 || nativeActionAvailable(api, "ungroup") || (!allFrames && sectionActions)) && (
        <>
          <MenuDivider />
          {!allFrames && sectionActions && (
            <MenuActionRow
              icon={<FolderPlus className="size-3.5" />}
              label="Group into Section"
              onHover={() => setOpenSub(null)}
              onClick={() => { sectionActions.onCreateSection(); onClose(); }}
            />
          )}
          {selectedElementCount >= 2 && <NativeMenuRow api={api} name="group" label="Group" shortcut="Ctrl+G" onHover={() => setOpenSub(null)} onRun={runAndClose} />}
          {nativeActionAvailable(api, "ungroup") && <NativeMenuRow api={api} name="ungroup" label="Ungroup" shortcut="Ctrl+Shift+G" onHover={() => setOpenSub(null)} onRun={runAndClose} />}
        </>
      )}

      <MenuDivider />

      <SubmenuItem id="layer" openId={openSub} icon={<Layers className="size-3.5" />} label="Layer" panelClassName="w-48" onOpen={setOpenSub}>
        <div className="grid gap-0.5">
          <NativeMenuRow api={api} name="bringToFront" label="Bring to front" onRun={runAndClose} />
          <NativeMenuRow api={api} name="bringForward" label="Bring forward" onRun={runAndClose} />
          <NativeMenuRow api={api} name="sendBackward" label="Send backward" onRun={runAndClose} />
          <NativeMenuRow api={api} name="sendToBack" label="Send to back" onRun={runAndClose} />
        </div>
      </SubmenuItem>

      {selectedElementCount >= 2 && (
        <SubmenuItem id="align" openId={openSub} icon={<AlignHorizontalJustifyCenter className="size-3.5" />} label="Align & distribute" panelClassName="w-52" onOpen={setOpenSub}>
          <div className="grid gap-0.5">
            <NativeMenuRow api={api} name="alignLeft" label="Align left" onRun={runAndClose} />
            <NativeMenuRow api={api} name="alignHorizontallyCentered" label="Align center" onRun={runAndClose} />
            <NativeMenuRow api={api} name="alignRight" label="Align right" onRun={runAndClose} />
            <NativeMenuRow api={api} name="alignTop" label="Align top" onRun={runAndClose} />
            <NativeMenuRow api={api} name="alignVerticallyCentered" label="Align middle" onRun={runAndClose} />
            <NativeMenuRow api={api} name="alignBottom" label="Align bottom" onRun={runAndClose} />
            <MenuDivider />
            <NativeMenuRow api={api} name="distributeHorizontally" label="Distribute horizontally" disabled={selectedElementCount < 3} onRun={runAndClose} />
            <NativeMenuRow api={api} name="distributeVertically" label="Distribute vertically" disabled={selectedElementCount < 3} onRun={runAndClose} />
          </div>
        </SubmenuItem>
      )}

      <SubmenuItem id="more" openId={openSub} icon={<NativeDotsHorizontalIcon className="size-3.5" />} label="Transform & export" panelClassName="w-52" onOpen={setOpenSub}>
        <div className="grid gap-0.5">
          <NativeMenuRow api={api} name="flipHorizontal" label="Flip horizontal" shortcut="Shift+H" onRun={runAndClose} />
          <NativeMenuRow api={api} name="flipVertical" label="Flip vertical" shortcut="Shift+V" onRun={runAndClose} />
          <MenuDivider />
          <NativeMenuRow api={api} name="copyAsPng" label="Copy as PNG" shortcut="Shift+Alt+C" onRun={runAndClose} />
          <NativeMenuRow api={api} name="copyAsSvg" label="Copy as SVG" onRun={runAndClose} />
          <MenuDivider />
          <NativeMenuRow api={api} name="wrapSelectionInFrame" label="Wrap in frame" onRun={runAndClose} />
          <NativeMenuRow api={api} name="addToLibrary" label="Add to library" onRun={runAndClose} />
          {nativeActionAvailable(api, "hyperlink") && (
            <MenuActionRow icon={<NativeEmbedIcon className="size-3.5" />} label="Add link" shortcut="Ctrl+K" onClick={() => runNativeAndClose("hyperlink")} />
          )}
        </div>
      </SubmenuItem>

      <MenuDivider />

      <NativeMenuRow api={api} name="toggleElementLock" label={allLocked ? "Unlock" : "Lock"} shortcut="Ctrl+Shift+L" onHover={() => setOpenSub(null)} onRun={runAndClose} />
      <NativeMenuRow api={api} name="deleteSelectedElements" label="Delete" shortcut="Del" danger onHover={() => setOpenSub(null)} onRun={runAndClose} />
    </>
  );
}

export function CanvasMenuBody({
  api,
  fullMode,
  gridModeEnabled,
  objectsSnapModeEnabled,
  viewModeEnabled,
  onToggleFullMode,
  onAction,
  onClose,
}: {
  api: ExcalidrawImperativeAPI;
  fullMode: boolean;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  viewModeEnabled: boolean;
  onToggleFullMode?: () => void;
  onAction: (name: CanvasRuntimeActionName) => void;
  onClose: () => void;
}) {
  const runAndClose = (name: CanvasRuntimeActionName) => {
    onAction(name);
    onClose();
  };
  const runNativeAndClose = (name: string) => {
    executeNativeAction(api, name);
    onClose();
  };
  return (
    <>
      {onToggleFullMode && (
        <>
          <MenuActionRow
            icon={fullMode ? <Minimize2 className="size-3.5 text-accent" /> : <Maximize2 className="size-3.5" />}
            label={fullMode ? "Exit full mode" : "Full mode"}
            shortcut="Alt+Z"
            active={fullMode}
            onClick={() => { onToggleFullMode(); onClose(); }}
          />
          <MenuDivider />
        </>
      )}
      {nativeActionAvailable(api, "selectAll") && (
        <MenuActionRow icon={nativeActionIcon(api, "selectAll")} label="Select all" shortcut="Ctrl+A" onClick={() => runNativeAndClose("selectAll")} />
      )}
      <NativeMenuRow api={api} name="zoomToFit" label="Fit canvas" onRun={runAndClose} />
      <NativeMenuRow api={api} name="resetZoom" label="Reset zoom" shortcut="Ctrl+0" onRun={runAndClose} />
      <MenuDivider />
      <MenuActionRow
        icon={gridModeEnabled ? <Check className="size-3.5 text-accent" /> : nativeActionIcon(api, "gridMode")}
        label="Grid"
        shortcut="Ctrl+'"
        active={gridModeEnabled}
        onClick={() => runAndClose("gridMode")}
      />
      <MenuActionRow
        icon={objectsSnapModeEnabled ? <Check className="size-3.5 text-accent" /> : nativeActionIcon(api, "objectsSnapMode")}
        label="Snap to objects"
        shortcut="Alt+S"
        active={objectsSnapModeEnabled}
        onClick={() => runAndClose("objectsSnapMode")}
      />
      {nativeActionAvailable(api, "viewMode") && (
        <MenuActionRow
          icon={viewModeEnabled ? <Check className="size-3.5 text-accent" /> : nativeActionIcon(api, "viewMode")}
          label="View mode"
          shortcut="Alt+R"
          active={viewModeEnabled}
          onClick={() => runNativeAndClose("viewMode")}
        />
      )}
      <MenuDivider />
      <NativeMenuRow api={api} name="copyAsPng" label="Copy as PNG" shortcut="Shift+Alt+C" onRun={runAndClose} />
      <NativeMenuRow api={api} name="copyAsSvg" label="Copy as SVG" onRun={runAndClose} />
    </>
  );
}
