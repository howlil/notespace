import { Maximize, Redo2, RotateCcw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { IconButton, cn } from "../../../../shared/ui";
import { useAnchoredPanelDismiss, useAnchoredPanelPosition } from "../../../../shared/ui/overlays/anchored-panel";
import { nativeActionIcon } from "../native/CanvasNativeActions";
import { NativeDotsHorizontalIcon, NativeLibraryIcon } from "../native/CanvasNativeIcons";
import type { CanvasActionName } from "../native/CanvasToolbar";
import { MenuAction, MenuSection, motionTransition } from "./CanvasChromeMenu";
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
] as const;
function BackgroundPalette({ backgroundColor, onBackgroundChange }: { backgroundColor: string; onBackgroundChange: (color: string) => void }) {
  return (
    <div className="grid gap-2 p-2">
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Canvas background colors">
        {canvasBackgroundOptions.map(({ label, color }) => (
          <button key={color} type="button" className={cn("size-7 rounded border border-line hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent", backgroundColor.toLowerCase() === color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")} style={{ backgroundColor: color }} aria-label={`${label} background`} aria-pressed={backgroundColor.toLowerCase() === color} onClick={() => onBackgroundChange(color)} />
        ))}
      </div>
      <label className="flex items-center gap-2 border-t border-line pt-2 text-[9px] text-muted">
        <span className="min-w-0 flex-1">Custom color</span>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : "#ffffff"} aria-label="Custom canvas background" className="size-6 cursor-pointer rounded border border-line bg-transparent p-0.5" onChange={(event) => onBackgroundChange(event.target.value)} />
      </label>
    </div>
  );
}

function ViewMenuAction({ api, name, label, active, onClick }: { api: ExcalidrawImperativeAPI | null; name: string; label: string; active?: boolean; onClick: () => void }) {
  const icon = nativeActionIcon(api, name);
  return <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", active && "bg-tint text-accent")} aria-pressed={active} onClick={onClick}>{icon && <span className="grid size-4 place-items-center [&_svg]:size-4">{icon}</span>}<span>{label}</span></button>;
}

function CanvasIconAction({ api, nativeAction, label, icon, onClick }: { api: ExcalidrawImperativeAPI | null; nativeAction?: string; label: string; icon: ReactNode; onClick: () => void }) {
  const nativeIcon = nativeActionIcon(api, nativeAction);
  return <IconButton type="button" variant="ghost" className="!size-7 text-ink/70 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" aria-label={label} title={label} onClick={onClick}><span className="grid place-items-center [&_svg]:size-4">{nativeIcon ?? icon}</span></IconButton>;
}

function CanvasCommandMenu({ api, anchorRef, open, backgroundColor, gridModeEnabled, objectsSnapModeEnabled, libraryOpen, onBackgroundChange, onToggleLibrary, onAction, onClose }: {
  api: ExcalidrawImperativeAPI | null;
  anchorRef: { current: HTMLDivElement | null };
  open: boolean;
  backgroundColor: string;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  libraryOpen: boolean;
  onBackgroundChange: (color: string) => void;
  onToggleLibrary: () => void;
  onAction: (name: CanvasActionName) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, open, 244, 520, { horizontalAlignment: "end" });
  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose);
  const run = (name: CanvasActionName) => { onAction(name); onClose(); };
  if (typeof document === "undefined") return null;

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.985, y: -3 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.985, y: -3 }}
          transition={motionTransition}
          id="canvas-command-menu"
          className="fixed z-[1000] grid max-h-[min(72dvh,520px)] w-[min(244px,calc(100vw-16px))] gap-2 overflow-y-auto rounded-lg border border-line bg-surface p-2 text-ink shadow-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0"
          style={{ top: position?.top ?? 8, left: position?.left ?? 8, visibility: position ? "visible" : "hidden" }}
          role="dialog"
          aria-label="Canvas options"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="px-2 pt-1 pb-0.5"><h2 className="m-0 text-[10px] font-medium">Canvas options</h2></header>
          <MenuSection label="View">
            <ViewMenuAction api={api} name="gridMode" label="Grid" active={gridModeEnabled} onClick={() => onAction("gridMode")} />
            <ViewMenuAction api={api} name="objectsSnapMode" label="Object snapping" active={objectsSnapModeEnabled} onClick={() => onAction("objectsSnapMode")} />
            <button type="button" className={cn("flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[10px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", libraryOpen && "bg-tint text-accent")} aria-pressed={libraryOpen} onClick={() => { onToggleLibrary(); onClose(); }}><NativeLibraryIcon className="size-4" /><span>Library</span></button>
          </MenuSection>
          <MenuSection label="Canvas">
            <div className="grid gap-1 rounded-md border border-line p-1">
              <span className="px-2 pt-1 text-[9px] text-muted">Canvas background</span>
              <BackgroundPalette backgroundColor={backgroundColor} onBackgroundChange={onBackgroundChange} />
            </div>
            <MenuAction api={api} nativeAction="clearCanvas" label="Reset canvas" shortcut="⌘⌫" onClick={() => run("clearCanvas")} />
          </MenuSection>
          <MenuSection label="File & export">
            <MenuAction api={api} nativeAction="loadScene" label="Open" shortcut="⌘O" onClick={() => run("loadScene")} />
            <MenuAction api={api} nativeAction="saveFileToDisk" label="Save to file" shortcut="⌘S" onClick={() => run("saveFileToDisk")} />
            <MenuAction api={api} nativeAction="imageExport" label="Export image" shortcut="⇧⌘E" onClick={() => run("imageExport")} />
            <MenuAction api={api} nativeAction="copyAsPng" label="Copy as PNG" onClick={() => run("copyAsPng")} />
            <MenuAction api={api} nativeAction="copyAsSvg" label="Copy as SVG" onClick={() => run("copyAsSvg")} />
          </MenuSection>
          <MenuSection label="Navigate & help">
            <MenuAction api={api} nativeAction="searchMenu" label="Find on canvas" shortcut="⌘F" onClick={() => run("searchMenu")} />
            <MenuAction api={api} nativeAction="commandPalette" label="Command palette" shortcut="⌘/" onClick={() => run("commandPalette")} />
            <MenuAction api={api} nativeAction="toggleShortcuts" label="Help" shortcut="?" onClick={() => run("toggleShortcuts")} />
          </MenuSection>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}
export function CanvasViewControls({ api, gridModeEnabled, objectsSnapModeEnabled, onAction, onToolOverlayOpen, onOverlayOpen, overlayActive = true, toolOverlayOpen }: {
  api: ExcalidrawImperativeAPI | null;
  gridModeEnabled: boolean;
  objectsSnapModeEnabled: boolean;
  onAction: (name: CanvasActionName) => void;
  onToolOverlayOpen: () => void;
  onOverlayOpen?: () => void;
  overlayActive?: boolean;
  toolOverlayOpen?: boolean;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const closeCommandMenu = useCallback(() => setCommandMenuOpen(false), []);

  useEffect(() => {
    if (!api) { setLibraryOpen(false); return undefined; }
    const sync = (openSidebar: AppState["openSidebar"]) => setLibraryOpen(openSidebar?.name === "default" && openSidebar.tab === "library");
    sync(api.getAppState().openSidebar);
    setBackgroundColor(api.getAppState().viewBackgroundColor);
    return api.onStateChange("openSidebar", sync);
  }, [api]);

  useEffect(() => {
    if (toolOverlayOpen) closeCommandMenu();
  }, [closeCommandMenu, toolOverlayOpen]);

  useEffect(() => {
    if (!overlayActive) closeCommandMenu();
  }, [closeCommandMenu, overlayActive]);

  const toggleLibrary = () => {
    if (!api) return;
    const openSidebar = api.getAppState().openSidebar;
    const isOpen = openSidebar?.name === "default" && openSidebar.tab === "library";
    api.toggleSidebar({ name: "default", tab: "library", force: !isOpen });
  };

  const changeBackground = (color: string) => {
    if (!api) return;
    setBackgroundColor(color);
    api.updateScene({ appState: { viewBackgroundColor: color } });
  };
  const runQuickAction = (name: CanvasActionName) => {
    closeCommandMenu();
    onAction(name);
  };

  return (
    <motion.aside initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} transition={motionTransition} className="pointer-events-auto absolute top-2 right-2 z-20 flex max-w-[calc(100vw-16px)] flex-row items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas view controls" aria-orientation="horizontal" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-px" role="group" aria-label="Canvas zoom controls">
        <CanvasIconAction api={api} nativeAction="zoomToFit" label="Fit canvas" icon={<Maximize />} onClick={() => runQuickAction("zoomToFit")} />
        <CanvasIconAction api={api} nativeAction="resetZoom" label="Reset zoom" icon={<RotateCcw />} onClick={() => runQuickAction("resetZoom")} />
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
        <CanvasIconAction api={api} nativeAction="zoomOut" label="Zoom out" icon={<ZoomOut />} onClick={() => runQuickAction("zoomOut")} />
        <CanvasIconAction api={api} nativeAction="zoomIn" label="Zoom in" icon={<ZoomIn />} onClick={() => runQuickAction("zoomIn")} />
      </div>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
      <div className="flex items-center gap-px" role="group" aria-label="Canvas history controls">
        <CanvasIconAction api={api} nativeAction="undo" label="Undo" icon={<Undo2 />} onClick={() => runQuickAction("undo")} />
        <CanvasIconAction api={api} nativeAction="redo" label="Redo" icon={<Redo2 />} onClick={() => runQuickAction("redo")} />
      </div>
      <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
      <div ref={commandMenuRef} className="relative">
        <IconButton id="canvas-options-trigger" type="button" variant="ghost" className={cn("!size-8 text-ink/70 hover:bg-tint hover:text-accent", commandMenuOpen && "!bg-tint !text-accent ring-1 ring-accent/15")} aria-label="More canvas actions" aria-haspopup="dialog" aria-expanded={commandMenuOpen} aria-controls="canvas-command-menu" title="Canvas options" onClick={() => { if (!commandMenuOpen) { onToolOverlayOpen(); onOverlayOpen?.(); } setCommandMenuOpen((open) => !open); }}><NativeDotsHorizontalIcon className="size-5" /></IconButton>
        <CanvasCommandMenu api={api} anchorRef={commandMenuRef} open={commandMenuOpen} backgroundColor={backgroundColor} gridModeEnabled={gridModeEnabled} objectsSnapModeEnabled={objectsSnapModeEnabled} libraryOpen={libraryOpen} onBackgroundChange={changeBackground} onToggleLibrary={toggleLibrary} onAction={onAction} onClose={closeCommandMenu} />
      </div>
    </motion.aside>
  );
}
