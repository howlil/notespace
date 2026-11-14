import { Code2, Network, StickyNote } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { IconButton, cn } from "../../../../shared/ui";
import { useAnchoredPanelDismiss, useAnchoredPanelPosition } from "../../../../shared/ui/overlays/anchored-panel";
import { NativeDotsHorizontalIcon } from "../native/CanvasNativeIcons";
import type { CanvasActionName } from "../native/CanvasToolbar";
import { primaryTools, secondaryTools, secondaryToolGroups, supportedTools, ToolGlyph, controlGlyphClass, type ToolDefinition, type ToolbarTool } from "./canvas-tool-catalog";
import { MenuSection, motionTransition } from "./CanvasChromeMenu";
function ToolButton({ icon, label, shortcut, active, id, toolType, ariaExpanded, ariaControls, onClick }: { icon: ReactNode; label: string; shortcut?: string; active?: boolean; id?: string; toolType?: string; ariaExpanded?: boolean; ariaControls?: string; onClick: () => void }) {
  return (
    <IconButton
      type="button"
      id={id}
      data-canvas-tool={toolType}
      variant="ghost"
      className={cn("relative !size-8 shrink-0 text-ink/70", active ? "!bg-tint !text-accent ring-1 ring-accent/15" : "hover:bg-tint hover:text-accent")}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      {icon}
      {shortcut && <kbd className="pointer-events-none absolute right-0.5 bottom-0 text-[8px] font-semibold leading-none text-ink/60 max-[560px]:hidden">{shortcut}</kbd>}
    </IconButton>
  );
}

function CompactMenuTool({ api, tool, active, buttonRef, onClick }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition; active: boolean; buttonRef?: Ref<HTMLButtonElement>; onClick: () => void }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={cn("flex min-h-8 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-[10px] text-ink/80 transition-colors hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent", active && "border-accent/20 bg-tint text-accent")}
      aria-label={tool.label}
      aria-pressed={active}
      title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
      onClick={onClick}
    >
      <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4"><ToolGlyph api={api} tool={tool} /></span>
      <span className="min-w-0 flex-1 truncate">{tool.label}</span>
      {tool.shortcut && <kbd className="text-[8px] text-muted">{tool.shortcut}</kbd>}
    </button>
  );
}
function MoreToolsPanel({ open, anchorRef, api, activeTool, onSelectTool, onClose }: {
  open: boolean;
  anchorRef: { current: HTMLDivElement | null };
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  onSelectTool: (type: ToolbarTool) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const firstToolRef = useRef<HTMLButtonElement>(null);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, open, 176, 144);
  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose, { insideSelector: "[data-canvas-menu-trigger]" });
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => firstToolRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  if (typeof document === "undefined") return null;
  const availableTools = supportedTools(api);
  const groups = secondaryToolGroups
    .map((group) => ({ ...group, tools: group.tools.filter(({ type }) => availableTools.has(type)) }))
    .filter((group) => group.tools.length > 0);

  return createPortal((
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.98, x: -4 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.98, x: -4 }}
          transition={motionTransition}
          id="canvas-more-tools-panel"
          className="fixed z-[1000] w-[min(224px,calc(100vw-16px))] overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-none"
          style={{ top: position?.top ?? 8, left: position?.left ?? 8, visibility: "visible" }}
          role="dialog"
          aria-label="More canvas tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="px-3 pt-3 pb-2"><span className="text-[10px] font-medium">More tools</span></header>
          <div className="grid max-h-[min(62dvh,420px)] gap-3 overflow-y-auto px-2 pb-2">
            {groups.map((group) => (
              <MenuSection key={group.label} label={group.label}>
                <div className="grid gap-0.5">
                  {group.tools.map((tool) => (
                    <CompactMenuTool key={tool.type} api={api} tool={tool} active={activeTool === tool.type} buttonRef={tool === groups[0]?.tools[0] ? firstToolRef : undefined} onClick={() => { onSelectTool(tool.type); onClose(); }} />
                  ))}
                </div>
              </MenuSection>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  ), document.body);
}
export function CanvasToolRail(props: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  diagramAnchorRef: { current: HTMLDivElement | null };
  moreToolsAnchorRef: { current: HTMLDivElement | null };
  diagramOpen: boolean;
  moreOpen: boolean;
  backgroundColor: string;
  onOverlayOpen: () => void;
  onDiagramToggle: () => void;
  onMoreToggle: () => void;
  onCoreToolSelect: () => void;
  onInsertCodeBlock: () => void;
  onInsertNote: () => void;
  onBackgroundChange: (color: string) => void;
  onAction: (name: CanvasActionName) => void;
  diagramPanel: ReactNode;
}) {
  const { api, activeTool, diagramAnchorRef, moreToolsAnchorRef, diagramOpen, moreOpen, onOverlayOpen, onDiagramToggle, onMoreToggle, onCoreToolSelect, onInsertCodeBlock, onInsertNote, diagramPanel } = props;
  const availableTools = supportedTools(api);
  const activeSecondaryTool = secondaryTools.find(({ type }) => type === activeTool);
  const railRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const revealActiveTool = () => {
      if (getComputedStyle(rail).flexDirection !== "row") return;
      const button = Array.from(rail.querySelectorAll<HTMLElement>("[data-canvas-tool]")).find((element) => element.dataset.canvasTool === activeTool);
      const scroller = button?.parentElement;
      if (!button || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
      const item = button.getBoundingClientRect(), area = scroller.getBoundingClientRect();
      if (item.left < area.left) scroller.scrollLeft += item.left - area.left;
      else if (item.right > area.right) scroller.scrollLeft += item.right - area.right;
    };
    revealActiveTool();
    const observer = new ResizeObserver(revealActiveTool);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [activeTool]);
  const selectTool = (type: ToolbarTool) => {
    if (!api || !availableTools.has(type)) return;
    api.setActiveTool({ type }, { keepSelection: false });
    onCoreToolSelect();
  };

  useEffect(() => {
    const openDiagramFromSlash = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      event.stopPropagation();
      if (!diagramOpen) {
        onDiagramToggle();
        return;
      }
      const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search all Eraser icons"]');
      searchInput?.focus({ preventScroll: true });
      searchInput?.select();
    };
    document.addEventListener("keydown", openDiagramFromSlash, true);
    return () => document.removeEventListener("keydown", openDiagramFromSlash, true);
  }, [diagramOpen, onDiagramToggle]);

  return (
    <motion.div ref={railRef} initial={{ opacity: 1, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={motionTransition} className="pointer-events-auto relative flex flex-col items-center gap-0.5 overflow-visible rounded-lg border border-line bg-surface p-1 shadow-none" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {primaryTools.filter(({ type }) => availableTools.has(type)).map((tool) => <ToolButton key={tool.type} toolType={tool.type} icon={<ToolGlyph api={api} tool={tool} />} label={tool.label} shortcut={tool.shortcut} active={activeTool === tool.type} onClick={() => selectTool(tool.type)} />)}
        <ToolButton icon={<Code2 className={controlGlyphClass} strokeWidth={1.5} />} label="Code block" onClick={() => { if (diagramOpen) onDiagramToggle(); onCoreToolSelect(); onInsertCodeBlock(); }} />
        <ToolButton icon={<StickyNote className={controlGlyphClass} strokeWidth={1.5} />} label="Note" shortcut="N" onClick={() => { if (diagramOpen) onDiagramToggle(); onCoreToolSelect(); onInsertNote(); }} />
      </div>
      <span className="my-0.5 h-px w-5 shrink-0 bg-line" aria-hidden="true" />
      <div ref={diagramAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0">
        <ToolButton icon={<Network className={controlGlyphClass} strokeWidth={1.5} />} label="Diagram" shortcut="/" active={diagramOpen} onClick={() => { if (!diagramOpen) onOverlayOpen(); onDiagramToggle(); }} />
        {diagramPanel}
      </div>
      <div ref={moreToolsAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0">
        <ToolButton
          id="canvas-more-tools-trigger"
          toolType={activeSecondaryTool?.type}
          icon={activeSecondaryTool ? <ToolGlyph api={api} tool={activeSecondaryTool} /> : <NativeDotsHorizontalIcon className={controlGlyphClass} />}
          label={activeSecondaryTool ? `More tools · ${activeSecondaryTool.label}` : "More tools"}
          active={moreOpen || Boolean(activeSecondaryTool)}
          ariaExpanded={moreOpen}
          ariaControls="canvas-more-tools-panel"
          onClick={() => { if (!moreOpen) onOverlayOpen(); onMoreToggle(); }}
        />
        <MoreToolsPanel open={moreOpen} anchorRef={moreToolsAnchorRef} api={api} activeTool={activeTool} onSelectTool={selectTool} onClose={() => { if (moreOpen) onMoreToggle(); }} />
      </div>
    </motion.div>
  );
}
