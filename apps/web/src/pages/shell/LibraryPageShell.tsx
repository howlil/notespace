import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { NotespaceLogo } from "../../shared/ui/brand/NotespaceLogo";
import { HeaderPlacement, useDesktopChrome } from "../../features/desktop";
import { SettingsTrigger } from "../../features/settings";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search";
import { useLibraryExplorer } from "../../features/library";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  canvas?: boolean;
  workspaceTitle?: string;
  headerActions?: ReactNode;
};

function hasForegroundOverlay() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"], [data-code-toolbar-popup]'))
    .some((element) => element.getClientRects().length > 0);
}

function ownsTextInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function isExplorerShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key === "\\" && !ownsTextInput(event.target);
}

function cycleDrawerFocus(event: KeyboardEvent, toggle: HTMLButtonElement | null, panel: HTMLElement | null) {
  const header = toggle?.closest(".desktop-titlebar, header") ?? null;
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]';
  const targets = [header, panel].flatMap((root) => Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? []))
    .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
  const first = targets[0], last = targets[targets.length - 1];
  const boundary = event.shiftKey ? first : last;
  if (!boundary || document.activeElement !== boundary) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

function useExplorerPresentation() {
  const { preference, setPreference, drawerOpen, setDrawerOpen } = useLibraryExplorer();
  // Match SSR on the first render; media presentation is resolved after hydration.
  const [narrow, setNarrow] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const open = narrow ? drawerOpen : preference !== "closed";
  const close = useCallback(() => {
    if (narrow) setDrawerOpen(false);
    else setPreference("closed");
    toggleRef.current?.focus({ preventScroll: true });
  }, [narrow, setDrawerOpen, setPreference]);
  const toggle = useCallback(() => {
    if (open) close();
    else if (narrow) setDrawerOpen(true);
    else setPreference("open");
    toggleRef.current?.focus({ preventScroll: true });
  }, [close, narrow, open, setDrawerOpen, setPreference]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      if (panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
      setNarrow(media.matches);
      setDrawerOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [setDrawerOpen]);

  useLayoutEffect(() => {
    const panel = panelRef.current, main = mainRef.current;
    if (panel) {
      if (!open && panel.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
      panel.inert = !open;
    }
    if (main) main.inert = narrow && open;
    return () => { if (main) main.inert = false; };
  }, [narrow, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || hasForegroundOverlay()) return;
      if (isExplorerShortcut(event)) {
        event.preventDefault();
        toggle();
        return;
      }
      if (!narrow || !open) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") cycleDrawerFocus(event, toggleRef.current, panelRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, narrow, open, toggle]);

  return { narrow, open, close, toggle, panelRef, mainRef, toggleRef };
}

type ExplorerPresentation = ReturnType<typeof useExplorerPresentation>;

function ShellHeader({ explorer, workspaceTitle, headerActions }: Pick<Props, "workspaceTitle" | "headerActions"> & { explorer: ExplorerPresentation }) {
  const { customChromeActive } = useDesktopChrome();
  return <HeaderPlacement className="relative z-50 flex h-[38px] min-h-[38px] shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        {!customChromeActive && <Link to="/" search={{}} aria-label="Notespace home" title="Home"
          className="grid size-7 shrink-0 place-items-center rounded-md text-ink/70 hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent">
          <NotespaceLogo size="sm" showWordmark={false} />
        </Link>}
        <button ref={explorer.toggleRef} data-explorer-toggle type="button"
          className="grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent px-0 text-ink/70 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={explorer.open ? "Hide Explorer" : "Show Explorer"} title={explorer.open ? "Hide Explorer" : "Show Explorer"}
          aria-expanded={explorer.open} aria-controls="notespace-home-sidebar" aria-keyshortcuts="Control+\\ Meta+\\" onClick={explorer.toggle}>
          {explorer.open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        {workspaceTitle && <div role="group" aria-label="Current workspace"
          className="min-w-0 max-w-[228px] truncate border-l border-line pl-2 text-[11px] font-medium text-ink min-[1000px]:max-w-[calc((100vw_-_640px)/2)]"
          title={workspaceTitle}>{workspaceTitle}</div>}
        <div className="min-w-0 flex-1" data-tauri-drag-region />
        <button type="button" data-notespace-titlebar-search
          className="pointer-events-auto flex h-7 w-[min(390px,42vw)] min-w-0 shrink items-center gap-2 rounded-md border border-line bg-background px-2 text-left text-[11px] text-muted transition-colors duration-100 hover:border-accent/35 hover:bg-tint/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 min-[1000px]:absolute min-[1000px]:left-1/2 min-[1000px]:top-1/2 min-[1000px]:-translate-x-1/2 min-[1000px]:-translate-y-1/2"
          aria-label="Search Notespace" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title="Search · Ctrl/⌘ K"
          onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}>
          <Search size={14} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Search Notespace</span>
          <kbd className="ml-auto shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] text-muted max-[760px]:hidden">Ctrl/⌘ K</kbd>
        </button>
        {headerActions}
      </HeaderPlacement>;
}

function ExplorerPanel({ sidebar, explorer }: Pick<Props, "sidebar"> & { explorer: ExplorerPresentation }) {
  return <>
        {explorer.narrow && explorer.open && <button type="button" tabIndex={-1} aria-label="Close Explorer"
          className="absolute inset-0 z-30 bg-black/35" onClick={explorer.close} />}
        <div ref={explorer.panelRef} id="notespace-home-sidebar" aria-hidden={!explorer.open}
          data-notespace-library-explorer={explorer.open ? "open" : "closed"}
          className={`h-full min-h-0 w-[228px] shrink-0 overflow-hidden bg-sidebar transition-[width] duration-160 ease-out motion-reduce:transition-none ${explorer.narrow ? "absolute left-0 top-0 z-40" : "relative"}`}
          style={{ width: explorer.open ? 228 : 0, maxWidth: explorer.narrow ? "calc(100vw - 40px)" : undefined, visibility: explorer.open ? "visible" : "hidden" }}>
          <div className="flex h-full min-h-0 w-[228px] max-w-full flex-col border-r border-line">
            <div className="min-h-0 flex-1 overflow-hidden">{sidebar}</div>
            <div className="flex shrink-0 flex-col gap-1 border-t border-line px-2 py-2">
              <SettingsTrigger showLabel className="w-full justify-start gap-2 rounded-md border-0 px-2.5 py-2 text-left text-[11px] text-ink hover:bg-tint hover:text-accent" />
            </div>
          </div>
        </div>
  </>;
}

/** One mounted Explorer and authoring surface; only their presentation changes. */
export function LibraryPageShell({ sidebar, children, canvas = false, workspaceTitle, headerActions }: Props) {
  const explorer = useExplorerPresentation();
  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-background" data-notespace-single-shell>
      <ShellHeader explorer={explorer} workspaceTitle={workspaceTitle} headerActions={headerActions} />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <ExplorerPanel sidebar={sidebar} explorer={explorer} />
        <main ref={explorer.mainRef} className={canvas
          ? "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
          : "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background"}>
          {children}
        </main>
      </div>
    </div>
  );
}
