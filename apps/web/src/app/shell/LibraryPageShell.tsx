import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { NotespaceLogo } from "../../shared/ui/brand/NotespaceLogo";
import { IconButton, Kbd } from "../../shared/ui";
import { useStore } from "../../shared/lib/use-store";
import { useDesktopChrome } from "../../platform/desktop";
import { SettingsTrigger } from "../settings";
import { useLibraryExplorer } from "../../modules/library";
import { appShellStore, openQuickOpen, setCanvasFullMode } from "./app-shell-store";

type Props = {
  sidebar: ReactNode;
  rightDock?: ReactNode;
  children: ReactNode;
  canvas?: boolean;
};

function hasForegroundOverlay() {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"]'))
    .some((element) => element.getClientRects().length > 0);
}

function ownsTextInput(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function isExplorerShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key === "\\" && !ownsTextInput(event.target);
}

function cycleDrawerFocus(event: KeyboardEvent, toggle: HTMLButtonElement | null, panel: HTMLElement | null) {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]';
  const targets = [toggle, ...Array.from(panel?.querySelectorAll<HTMLElement>(selector) ?? [])]
    .filter((element): element is HTMLElement => Boolean(element && element.getClientRects().length > 0 && !element.closest("[inert]")));
  const first = targets[0], last = targets[targets.length - 1];
  const boundary = event.shiftKey ? first : last;
  if (!boundary || document.activeElement !== boundary) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}

function useExplorerPresentation(hideShell: boolean) {
  const { preference, setPreference, drawerOpen, setDrawerOpen } = useLibraryExplorer();
  // Match SSR on the first render; media presentation is resolved after hydration.
  const [narrow, setNarrow] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const peekTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const open = narrow ? drawerOpen : preference !== "closed";
  const shown = !hideShell && (open || (!narrow && peeking));

  const cancelClosePeek = useCallback(() => {
    if (peekTimerRef.current !== null) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }, []);

  const openPeek = useCallback(() => {
    if (narrow || open || hideShell) return;
    cancelClosePeek();
    setPeeking(true);
  }, [cancelClosePeek, hideShell, narrow, open]);

  const closePeek = useCallback(() => {
    cancelClosePeek();
    setPeeking(false);
  }, [cancelClosePeek]);

  const scheduleClosePeek = useCallback(() => {
    cancelClosePeek();
    peekTimerRef.current = window.setTimeout(() => {
      peekTimerRef.current = null;
      if (ownsTextInput(document.activeElement) && panelRef.current?.contains(document.activeElement)) return;
      if (hasForegroundOverlay()) return;
      setPeeking(false);
    }, 180);
  }, [cancelClosePeek]);

  const close = useCallback(() => {
    closePeek();
    if (narrow) setDrawerOpen(false);
    else setPreference("closed");
    toggleRef.current?.focus({ preventScroll: true });
  }, [closePeek, narrow, setDrawerOpen, setPreference]);

  const toggle = useCallback(() => {
    closePeek();
    if (open) close();
    else if (narrow) setDrawerOpen(true);
    else setPreference("open");
    toggleRef.current?.focus({ preventScroll: true });
  }, [close, closePeek, narrow, open, setDrawerOpen, setPreference]);

  useEffect(() => {
    if (open || narrow || hideShell) {
      cancelClosePeek();
      setPeeking(false);
    }
  }, [cancelClosePeek, hideShell, narrow, open]);

  useEffect(() => () => cancelClosePeek(), [cancelClosePeek]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      if (panelRef.current?.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
      setNarrow(media.matches);
      setDrawerOpen(false);
      setPeeking(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [setDrawerOpen]);

  useLayoutEffect(() => {
    const panel = panelRef.current, main = mainRef.current;
    if (panel) {
      if (!shown && panel.contains(document.activeElement)) toggleRef.current?.focus({ preventScroll: true });
      panel.inert = !shown;
    }
    if (main) main.inert = narrow && open && !hideShell;
    return () => { if (main) main.inert = false; };
  }, [hideShell, narrow, open, shown]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || hasForegroundOverlay()) return;
      if (isExplorerShortcut(event)) {
        event.preventDefault();
        toggle();
        return;
      }
      if (!narrow && peeking && event.key === "Escape") {
        event.preventDefault();
        closePeek();
        return;
      }
      if (!narrow || !open) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") cycleDrawerFocus(event, toggleRef.current, panelRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, closePeek, narrow, open, peeking, toggle]);

  return {
    narrow,
    open,
    peeking,
    shown,
    close,
    toggle,
    openPeek,
    closePeek,
    scheduleClosePeek,
    cancelClosePeek,
    panelRef,
    mainRef,
    toggleRef,
  };
}

type ExplorerPresentation = ReturnType<typeof useExplorerPresentation>;

function ExplorerHeader({ explorer }: { explorer: ExplorerPresentation }) {
  const { customChromeActive, platform } = useDesktopChrome();
  const isMacosCustom = customChromeActive && platform === "macos";

  return (
    <div className="shrink-0">
      <div
        className="flex h-[36px] items-center gap-1 px-2"
        style={isMacosCustom ? { paddingLeft: 68 } : undefined}
      >
        {!isMacosCustom && (
          <Link
            to="/"
            search={{}}
            aria-label="Notespace home"
            title="Home"
            onClick={() => { if (!explorer.open && !explorer.narrow) explorer.closePeek(); }}
            className="flex h-7 min-w-0 items-center rounded-md px-1 text-ink/90 hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent"
          >
            <NotespaceLogo size="sm" gap="sm" />
          </Link>
        )}
        <div className="min-w-0 flex-1 self-stretch" data-tauri-drag-region />
        {isMacosCustom && (
          <Link
            to="/"
            search={{}}
            aria-label="Notespace home"
            title="Home"
            onClick={() => { if (!explorer.open && !explorer.narrow) explorer.closePeek(); }}
            className="grid size-7 shrink-0 place-items-center rounded-md text-ink/75 hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent"
          >
            <NotespaceLogo size="sm" showWordmark={false} />
          </Link>
        )}
        <IconButton
          ref={explorer.toggleRef}
          data-explorer-toggle
          type="button"
          size="sm"
          className="shrink-0 text-ink/70 hover:text-accent"
          aria-label={explorer.open ? "Hide Explorer" : "Show Explorer"}
          title={explorer.open ? "Hide Explorer · Ctrl+\\" : "Show Explorer · Ctrl+\\"}
          aria-expanded={explorer.open}
          aria-controls="notespace-home-sidebar"
          aria-keyshortcuts="Control+\\ Meta+\\"
          onClick={explorer.toggle}
        >
          {explorer.open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </IconButton>
      </div>
      <div className="border-b border-line px-2 pb-2">
        <button
          type="button"
          data-notespace-titlebar-search
          className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border border-line bg-background px-2 text-left text-sm text-muted transition-colors duration-100 hover:border-accent/35 hover:bg-tint/35 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Search Notespace"
          aria-haspopup="dialog"
          aria-keyshortcuts="Control+K Meta+K"
          title="Search · Ctrl/⌘ K"
          onClick={openQuickOpen}
        >
          <Search size={13} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">Search Notespace</span>
          <Kbd tone="surface" className="ml-auto px-1 max-[760px]:hidden">⌘K</Kbd>
        </button>
      </div>
    </div>
  );
}

function ExplorerPanel({
  sidebar,
  explorer,
  hidden = false,
}: Pick<Props, "sidebar"> & { explorer: ExplorerPresentation; hidden?: boolean }) {
  const isPeeking = !hidden && !explorer.narrow && !explorer.open && explorer.peeking;
  const isNarrowOpen = !hidden && explorer.narrow && explorer.open;
  const isDockedOpen = !hidden && !explorer.narrow && explorer.open;
  const visible = explorer.shown;
  const stateAttr = hidden ? "closed" : explorer.open ? "open" : isPeeking ? "peeking" : "closed";

  const panelClass = isPeeking
    ? "absolute left-0 top-0 bottom-0 z-[var(--z-shell-overlay)] h-full min-h-0 w-[var(--sidebar-width)] overflow-hidden bg-sidebar [box-shadow:var(--shadow-popup)] transition-[width,opacity,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
    : isNarrowOpen
      ? "absolute left-0 top-0 bottom-0 z-[var(--z-shell-overlay)] h-full min-h-0 w-[var(--sidebar-width)] overflow-hidden bg-sidebar transition-[width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      : "relative h-full min-h-0 w-[var(--sidebar-width)] shrink-0 overflow-hidden bg-sidebar transition-[width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

  return (
    <>
      {isNarrowOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close Explorer"
          className="absolute inset-0 z-[var(--z-shell-backdrop)] bg-black/35"
          onClick={explorer.close}
        />
      )}
      <div
        ref={explorer.panelRef}
        id="notespace-home-sidebar"
        aria-hidden={!visible}
        data-notespace-library-explorer={stateAttr}
        className={`${panelClass} ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        style={{
          width: isDockedOpen || isPeeking || isNarrowOpen ? 228 : 0,
          maxWidth: isNarrowOpen ? "calc(100vw - 40px)" : undefined,
        }}
        onPointerEnter={() => { if (isPeeking) explorer.cancelClosePeek(); }}
        onPointerLeave={() => { if (isPeeking) explorer.scheduleClosePeek(); }}
        onClick={(event) => {
          if (isPeeking && event.target instanceof Element && event.target.closest("a[href]")) {
            explorer.closePeek();
          }
        }}
      >
        <div
          className={`flex h-full min-h-0 w-[var(--sidebar-width)] max-w-full flex-col border-r border-line transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${visible ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0"}`}
        >
          <ExplorerHeader explorer={explorer} />
          <div className="min-h-0 flex-1 overflow-hidden">{sidebar}</div>
          <div className="flex shrink-0 flex-col gap-1 border-t border-line px-2 py-2">
            <SettingsTrigger showLabel className="w-full justify-start gap-2 rounded-md border-0 px-2.5 py-2 text-left text-[12px] text-ink hover:bg-tint hover:text-accent" />
          </div>
        </div>
      </div>
    </>
  );
}

/** One mounted Explorer and authoring surface; only their presentation changes. */
export function LibraryPageShell({ sidebar, rightDock, children, canvas = false }: Props) {
  const fullMode = useStore(appShellStore, (state) => state.canvasFullMode);
  const hideShell = canvas && fullMode;
  const explorer = useExplorerPresentation(hideShell);
  const { customChromeActive, platform } = useDesktopChrome();
  const isMacosCustom = customChromeActive && platform === "macos";

  useEffect(() => {
    if (!canvas) setCanvasFullMode(false);
  }, [canvas]);

  const showEdgePeek = !hideShell && !explorer.narrow && !explorer.open;
  const showNarrowTrigger = !hideShell && explorer.narrow && !explorer.open;

  return (
    <div
      className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      data-notespace-single-shell
      data-canvas-full-mode={hideShell ? "true" : undefined}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1">
        <ExplorerPanel sidebar={sidebar} explorer={explorer} hidden={hideShell} />

        {showEdgePeek && (
          <>
            <div
              data-explorer-edge-trigger
              aria-hidden="true"
              className="absolute left-0 bottom-0 z-30 w-2.5"
              style={{ top: isMacosCustom ? 36 : 0 }}
              onPointerEnter={explorer.openPeek}
              onPointerLeave={explorer.scheduleClosePeek}
            />
            {!explorer.peeking && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-1 z-20 h-7 w-[3px] rounded-full bg-ink/15"
                style={{ top: isMacosCustom ? 44 : 12 }}
              />
            )}
          </>
        )}

        {showNarrowTrigger && (
          <IconButton
            ref={explorer.toggleRef}
            data-explorer-toggle
            type="button"
            size="sm"
            className="absolute top-2 z-[var(--z-shell-backdrop)] text-ink/65 hover:text-accent"
            style={{ left: "calc(8px + var(--desktop-top-left-inset, 0px))" }}
            aria-label="Show Explorer"
            title="Show Explorer"
            aria-expanded={false}
            aria-controls="notespace-home-sidebar"
            onClick={explorer.toggle}
          >
            <PanelLeftOpen size={16} />
          </IconButton>
        )}

        <main
          ref={explorer.mainRef}
          onPointerDown={() => { if (explorer.peeking && !explorer.open) explorer.closePeek(); }}
          className={canvas
            ? "relative isolate min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
            : "min-h-0 min-w-0 flex-1 overflow-y-auto bg-background"}
        >
          {children}
        </main>
        {!hideShell && rightDock}
      </div>
    </div>
  );
}
