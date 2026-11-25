import { Code2, Network, StickyNote } from "lucide-react";
import type { MouseEvent, ReactNode, Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { IconButton, MenuItem, cn } from "../../../shared/ui";
import { useAnchoredPanelDismiss } from "../../../shared/ui/overlays/anchored-panel";
import { primaryToolGroups, supportedTools, ToolGlyph, controlGlyphClass, type ToolDefinition, type ToolGroupDefinition, type ToolbarTool } from "./canvas-tool-catalog";
import { motionTransition } from "./CanvasChromeMenu";
function ToolButton({ icon, label, shortcut, active, grouped, id, toolType, ariaExpanded, ariaControls, onClick, onContextMenu }: { icon: ReactNode; label: string; shortcut?: string; active?: boolean; grouped?: boolean; id?: string; toolType?: string; ariaExpanded?: boolean; ariaControls?: string; onClick: () => void; onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <IconButton
      type="button"
      id={id}
      data-canvas-tool={toolType}
      variant="ghost"
      className={cn("relative !size-8 shrink-0 text-ink/70 !outline-none focus-visible:!outline-none", active ? "!bg-tint !text-accent ring-1 ring-accent/15" : "hover:bg-tint hover:text-accent focus-visible:bg-tint/70")}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      title={shortcut ? `${label} (${shortcut})${grouped ? " · Left-click for group, Right-click for settings" : " · Right-click for settings"}` : label}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {icon}
      {grouped && <span className="pointer-events-none absolute top-1 right-1 size-1 rounded-full bg-current opacity-45" aria-hidden="true" />}
      {shortcut && <kbd className="pointer-events-none absolute right-0.5 bottom-0 text-[8px] font-semibold leading-none text-ink/60 max-[560px]:hidden">{shortcut}</kbd>}
    </IconButton>
  );
}

function ToolGroupSlot({
  group,
  api,
  activeTool,
  availableTools,
  open,
  onToggleOpen,
  onClose,
  onSelectTool,
  onOpenToolSettings,
}: {
  group: ToolGroupDefinition;
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  availableTools: ReadonlySet<ToolbarTool>;
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onSelectTool: (type: ToolbarTool) => void;
  onOpenToolSettings?: (type: ToolbarTool) => void;
}) {
  const tools = group.tools.filter(({ type }) => availableTools.has(type));
  const [lastToolType, setLastToolType] = useState<ToolbarTool | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const activeInGroup = tools.find(({ type }) => type === activeTool);
  useEffect(() => {
    if (activeInGroup) setLastToolType(activeInGroup.type);
  }, [activeInGroup]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const rail = anchorRef.current?.closest<HTMLElement>('[aria-label="Canvas tools"]')?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const margin = 8;
      const gap = 8;
      const railIsHorizontal = rail ? rail.width > rail.height : false;
      if (railIsHorizontal) {
        const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - panel.width - margin));
        const top = Math.max(margin, (rail?.top ?? anchor.top) - panel.height - gap);
        setPosition({ left, top });
        return;
      }
      const left = Math.min((rail?.right ?? anchor.right) + gap, window.innerWidth - panel.width - margin);
      const top = Math.max(margin, Math.min(anchor.top - 4, window.innerHeight - panel.height - margin));
      setPosition({ left, top });
    };
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useAnchoredPanelDismiss(open, panelRef, anchorRef, onClose, { insideSelector: "[data-canvas-menu-trigger]" });
  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => firstRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (tools.length === 0) return null;
  const current = activeInGroup ?? tools.find(({ type }) => type === lastToolType) ?? tools[0]!;
  const isGrouped = tools.length > 1;
  const isActive = Boolean(activeInGroup);

  return (
    <div ref={anchorRef} data-canvas-menu-trigger={isGrouped ? "true" : undefined} className="relative flex shrink-0">
      <ToolButton
        toolType={current.type}
        icon={<ToolGlyph api={api} tool={current} />}
        label={current.label}
        shortcut={current.shortcut}
        active={isActive || open}
        grouped={isGrouped}
        ariaExpanded={isGrouped ? open : undefined}
        ariaControls={isGrouped ? `canvas-tool-group-${group.id}` : undefined}
        onClick={() => {
          if (isGrouped) {
            onToggleOpen();
            return;
          }
          onClose();
          onSelectTool(current.type);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
          onOpenToolSettings?.(current.type);
        }}
      />
      {isGrouped && typeof document !== "undefined" && createPortal(
        <AnimatePresence initial={false}>
          {open && (
            <motion.aside
              ref={panelRef}
              id={`canvas-tool-group-${group.id}`}
              initial={{ opacity: 0, scale: 0.98, x: -4 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.98, x: -4 }}
              transition={motionTransition}
              className="fixed z-[var(--z-popover)] w-[176px] overflow-hidden rounded-lg border border-line bg-surface p-1 text-ink [box-shadow:var(--shadow-float)]"
              style={{ top: position?.top ?? 8, left: position?.left ?? 8, visibility: position ? "visible" : "hidden" }}
              role="dialog"
              aria-label={`${group.label} tools`}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <header className="px-2 pt-0.5 pb-1"><span className="text-[10px] font-medium text-muted">{group.label}</span></header>
              <div className="grid">
                {tools.map((tool, index) => (
                  <CompactMenuTool
                    key={tool.type}
                    api={api}
                    tool={tool}
                    active={activeTool === tool.type}
                    buttonRef={index === 0 ? firstRef : undefined}
                    onClick={() => {
                      setLastToolType(tool.type);
                      onSelectTool(tool.type);
                      onClose();
                    }}
                  />
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function CompactMenuTool({ api, tool, active, buttonRef, onClick }: { api: ExcalidrawImperativeAPI | null; tool: ToolDefinition; active: boolean; buttonRef?: Ref<HTMLButtonElement>; onClick: () => void }) {
  return (
    <MenuItem
      buttonRef={buttonRef}
      role="button"
      icon={<ToolGlyph api={api} tool={tool} />}
      label={tool.label}
      shortcut={tool.shortcut}
      active={active}
      title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
      className="min-h-[26px] rounded-md py-0.5 text-sm"
      onClick={onClick}
    />
  );
}
export function CanvasToolRail(props: {
  api: ExcalidrawImperativeAPI | null;
  activeTool: AppState["activeTool"]["type"];
  diagramAnchorRef: { current: HTMLDivElement | null };
  diagramOpen: boolean;
  onOverlayOpen: () => void;
  onDiagramToggle: () => void;
  onCoreToolSelect: () => void;
  onOpenToolSettings?: (type: ToolbarTool) => void;
  onInsertCodeBlock: () => void;
  onInsertNote: () => void;
  diagramPanel: ReactNode;
}) {
  const { api, activeTool, diagramAnchorRef, diagramOpen, onOverlayOpen, onDiagramToggle, onCoreToolSelect, onOpenToolSettings, onInsertCodeBlock, onInsertNote, diagramPanel } = props;
  const availableTools = supportedTools(api);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (diagramOpen) setOpenGroupId(null);
  }, [diagramOpen]);
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
      const searchInput = document.querySelector<HTMLInputElement>('input[aria-label="Search diagram components"]');
      searchInput?.focus({ preventScroll: true });
      searchInput?.select();
    };
    document.addEventListener("keydown", openDiagramFromSlash, true);
    return () => document.removeEventListener("keydown", openDiagramFromSlash, true);
  }, [diagramOpen, onDiagramToggle]);

  const [navigateGroup, ...drawingGroups] = primaryToolGroups;

  return (
    <motion.div ref={railRef} initial={{ opacity: 1, x: -3 }} animate={{ opacity: 1, x: 0 }} transition={motionTransition} className="pointer-events-auto relative flex flex-col items-center gap-0.5 overflow-visible rounded-lg border border-line bg-surface p-1 [box-shadow:var(--shadow-float)]" role="toolbar" aria-label="Canvas tools" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-h-0 flex-col items-center gap-0.5 overflow-y-auto no-scrollbar">
        {navigateGroup && (
          <ToolGroupSlot
            group={navigateGroup}
            api={api}
            activeTool={activeTool}
            availableTools={availableTools}
            open={openGroupId === navigateGroup.id}
            onToggleOpen={() => {
              if (openGroupId !== navigateGroup.id) onOverlayOpen();
              setOpenGroupId((current) => (current === navigateGroup.id ? null : navigateGroup.id));
            }}
            onClose={() => setOpenGroupId((current) => (current === navigateGroup.id ? null : current))}
            onSelectTool={selectTool}
            onOpenToolSettings={onOpenToolSettings}
          />
        )}
        <span className="my-0.5 h-px w-5 shrink-0 bg-line" aria-hidden="true" />
        {drawingGroups.map((group) => (
          <ToolGroupSlot
            key={group.id}
            group={group}
            api={api}
            activeTool={activeTool}
            availableTools={availableTools}
            open={openGroupId === group.id}
            onToggleOpen={() => {
              if (openGroupId !== group.id) onOverlayOpen();
              setOpenGroupId((current) => (current === group.id ? null : group.id));
            }}
            onClose={() => setOpenGroupId((current) => (current === group.id ? null : current))}
            onSelectTool={selectTool}
            onOpenToolSettings={onOpenToolSettings}
          />
        ))}
        <span className="my-0.5 h-px w-5 shrink-0 bg-line" aria-hidden="true" />
        <ToolButton icon={<StickyNote className={controlGlyphClass} strokeWidth={1.5} />} label="Note" shortcut="N" onClick={() => { setOpenGroupId(null); if (diagramOpen) onDiagramToggle(); onCoreToolSelect(); onInsertNote(); }} />
        <ToolButton icon={<Code2 className={controlGlyphClass} strokeWidth={1.5} />} label="Code block" onClick={() => { setOpenGroupId(null); if (diagramOpen) onDiagramToggle(); onCoreToolSelect(); onInsertCodeBlock(); }} />
        <div ref={diagramAnchorRef} data-canvas-menu-trigger="true" className="group relative flex shrink-0">
          <ToolButton icon={<Network className={controlGlyphClass} strokeWidth={1.5} />} label="Diagram" shortcut="/" active={diagramOpen} onClick={() => { setOpenGroupId(null); if (!diagramOpen) onOverlayOpen(); onDiagramToggle(); }} />
          {diagramPanel}
        </div>
      </div>
    </motion.div>
  );
}
