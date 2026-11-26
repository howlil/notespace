import { Copy, FolderOpen, ImageDown, PanelRight, Save } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { AnchoredPopover, ColorSwatchPicker, IconButton, MenuItem, cn } from "../../../shared/ui";
import { nativeActionIcon } from "../core/excalidraw-bridge/CanvasNativeActions";
import { NativeDotsHorizontalIcon } from "../core/excalidraw-bridge/CanvasNativeIcons";
import type { CanvasActionName } from "../core/excalidraw-bridge/canvas-action-names";
import { MenuAction, MenuSection, motionTransition } from "./CanvasChromeMenu";
const canvasBackgroundOptions = [
  { label: "Snow", value: "#ffffff" },
  { label: "Canvas", value: "#fafaf8" },
  { label: "Mist", value: "#f1f2f6" },
  { label: "Sky", value: "#e8eef6" },
  { label: "Lemon", value: "#fff8e7" },
  { label: "Mint", value: "#eef8f1" },
  { label: "Blush", value: "#fceff1" },
  { label: "Lavender", value: "#f1edff" },
  { label: "Ink", value: "#191a1f" },
  { label: "Slate", value: "#24262d" },
] as const;

function BackgroundPalette({
  backgroundColor,
  onBackgroundChange,
}: {
  backgroundColor: string;
  onBackgroundChange: (color: string) => void;
}) {
  return (
    <ColorSwatchPicker
      colors={canvasBackgroundOptions}
      value={backgroundColor}
      onChange={onBackgroundChange}
      label="Canvas background colors"
      columns={5}
      customLabel="Custom color"
      customStyle="row"
      className="px-2.5 pt-0.5 pb-1"
    />
  );
}

function ViewMenuAction({ api, name, label, active, onClick }: { api: ExcalidrawImperativeAPI | null; name: string; label: string; active?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return (
    <MenuItem
      role="button"
      icon={icon ?? undefined}
      label={label}
      checked={active}
      className={cn("min-h-[30px] gap-2.5 px-2.5 text-[12.5px]", active && "bg-tint/65")}
      onClick={onClick}
    />
  );
}

function CanvasCommandMenu({ api, anchorRef, open, backgroundColor, gridModeEnabled, objectsSnapModeEnabled, onBackgroundChange, onAction, onClose }: {
  api: ExcalidrawImperativeAPI | null;
  anchorRef: { current: HTMLDivElement | null };
  open: boolean;
  backgroundColor: string;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  onClose: () => void;
}) {
  const run = (name: CanvasActionName) => { onAction(name); onClose(); };

  return (
    <AnchoredPopover
      open={open}
      anchorRef={anchorRef}
      onClose={onClose}
      width={244}
      height={520}
      horizontalAlignment="end"
      id="canvas-command-menu"
      role="dialog"
      aria-label="Canvas options"
      className="grid max-h-[min(76dvh,540px)] w-[min(244px,calc(100vw-16px))] gap-0.5 rounded-xl p-1.5"
    >
      <MenuSection label="View">
        <ViewMenuAction api={api} name="gridMode" label="Grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
        <ViewMenuAction api={api} name="objectsSnapMode" label="Object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
      </MenuSection>
      <MenuSection label="Background">
        <BackgroundPalette
          backgroundColor={backgroundColor}
          onBackgroundChange={onBackgroundChange}
        />
      </MenuSection>
      <MenuSection label="File & export">
        <MenuAction api={api} nativeAction="loadScene" label="Open" shortcut="⌘O" fallbackIcon={<FolderOpen strokeWidth={1.5} />} onClick={() => run("loadScene")} />
        <MenuAction api={api} nativeAction="saveFileToDisk" label="Save to file" shortcut="⌘S" fallbackIcon={<Save strokeWidth={1.5} />} onClick={() => run("saveFileToDisk")} />
        <MenuAction api={api} nativeAction="imageExport" label="Export image" shortcut="⇧⌘E" fallbackIcon={<ImageDown strokeWidth={1.5} />} onClick={() => run("imageExport")} />
        <MenuAction api={api} nativeAction="copyAsPng" label="Copy as PNG" fallbackIcon={<Copy strokeWidth={1.5} />} onClick={() => run("copyAsPng")} />
        <MenuAction api={api} nativeAction="copyAsSvg" label="Copy as SVG" fallbackIcon={<Copy strokeWidth={1.5} />} onClick={() => run("copyAsSvg")} />
      </MenuSection>
      <div className="mt-1 border-t border-line/80 pt-1.5">
        <MenuAction api={api} nativeAction="clearCanvas" label="Reset canvas" shortcut="⌘⌫" danger onClick={() => run("clearCanvas")} />
      </div>
    </AnchoredPopover>
  );
}
export function CanvasViewControls({ api, gridModeEnabled, objectsSnapModeEnabled, onAction, onToolOverlayOpen, onOverlayOpen, overlayActive = true, toolOverlayOpen, rightPanelOpen = false, onToggleRightPanel }: {
  api: ExcalidrawImperativeAPI | null;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onAction: (name: CanvasActionName) => void;
  onToolOverlayOpen: () => void;
  onOverlayOpen?: () => void;
  overlayActive?: boolean;
  toolOverlayOpen?: boolean;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const closeCommandMenu = useCallback(() => setCommandMenuOpen(false), []);

  useEffect(() => {
    if (!api) return;
    setBackgroundColor(api.getAppState().viewBackgroundColor);
  }, [api]);

  useEffect(() => {
    if (toolOverlayOpen) closeCommandMenu();
  }, [closeCommandMenu, toolOverlayOpen]);

  useEffect(() => {
    if (!overlayActive) closeCommandMenu();
  }, [closeCommandMenu, overlayActive]);

  const changeBackground = (color: string) => {
    if (!api) return;
    setBackgroundColor(color);
    api.updateScene({ appState: { viewBackgroundColor: color } });
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition}
      className="pointer-events-auto absolute top-0 z-20 flex h-8 items-center gap-0.5"
      style={{ right: "calc(8px + var(--desktop-top-right-inset, 0px))" }}
      role="toolbar"
      aria-label="Canvas view controls"
      aria-orientation="horizontal"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onToggleRightPanel && (
        <IconButton
          type="button"
          variant="ghost"
          aria-label="Toggle side panel"
          aria-pressed={rightPanelOpen}
          title={rightPanelOpen ? "Hide side panel · ⌘1" : "Side panel · ⌘1"}
          className={cn(
            "!size-7 rounded-md text-ink/70 hover:bg-ink/[0.06] hover:text-ink",
            rightPanelOpen && "!bg-tint !text-accent",
          )}
          onClick={onToggleRightPanel}
        >
          <PanelRight size={15} aria-hidden="true" />
        </IconButton>
      )}
      <div ref={commandMenuRef} className="relative">
        <IconButton id="canvas-options-trigger" type="button" variant="ghost" className={cn("!size-7 rounded-md text-ink/70 hover:bg-ink/[0.06] hover:text-ink", commandMenuOpen && "!bg-tint !text-accent")} aria-label="More canvas actions" aria-haspopup="dialog" aria-expanded={commandMenuOpen} aria-controls="canvas-command-menu" title="Canvas options" onClick={() => { if (!commandMenuOpen) { onToolOverlayOpen(); onOverlayOpen?.(); } setCommandMenuOpen((open) => !open); }}><NativeDotsHorizontalIcon className="size-4" /></IconButton>
        <CanvasCommandMenu api={api} anchorRef={commandMenuRef} open={commandMenuOpen} backgroundColor={backgroundColor} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} onBackgroundChange={changeBackground} onAction={onAction} onClose={closeCommandMenu} />
      </div>
    </motion.aside>
  );
}
