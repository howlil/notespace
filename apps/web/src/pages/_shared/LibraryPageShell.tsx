import { LibraryCreateContext, type LibraryCreateRequest } from "./library-create-context";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, PanelLeftClose } from "lucide-react";
import { HeaderPlacement } from "../../shared/ui/desktop-titlebar/HeaderPlacement";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { ShellRail } from "./ShellRail";
import { useLibraryExplorer } from "../../shared/ui/library-explorer-provider";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  dashboard?: boolean;
  page?: "library" | "inbox" | "today";
  selectedCategoryId?: string;
};

/** Library, Inbox and Today share navigation but retain their independent feature state. */
export function LibraryPageShell({
  sidebar, children, headerActions, dashboard = false, page = "library", selectedCategoryId,
}: Props) {
  const { preference, setPreference } = useLibraryExplorer();
  const [createRequest, setCreateRequest] = useState<LibraryCreateRequest | null>(null);
  const sequence = useRef(0);
  const [compact, setCompact] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const expanded = preference === "open" || (preference === "auto" && !compact);
  const closeExplorer = () => { setPreference("closed"); toggleRef.current?.focus(); };
  const toggle = () => { if (expanded) closeExplorer(); else setPreference("open"); };

  useEffect(() => {
    if (!(compact && expanded)) return;
    const explorer = explorerRef.current;
    if (!explorer) return;

    // Mobile Explorer is a modal overlay. Preserve the inline-create input's
    // autofocus when creation opened the Explorer.
    if (!explorer.contains(document.activeElement)) closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (event.key === "Escape") {
        // Nested dialogs, menus and inline fields own their own Escape behavior.
        if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
        setPreference("closed");
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      // Global dialogs and portal menus take precedence over Explorer focus.
      if (target instanceof Element && !explorer.contains(target) && target.closest('[role="dialog"], [role="menu"]')) return;
      const focusable = Array.from(explorer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!explorer.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [compact, expanded, setPreference]);

  return (
    <div className={`${dashboard ? "dashboard-shell " : ""}flex h-dvh min-h-0 min-w-0 overflow-hidden bg-background`}>
      <ShellRail
        page={page}
        explorerOpen={expanded}
        selectedCategoryId={selectedCategoryId}
        explorerTriggerRef={toggleRef}
        onToggleExplorer={toggle}
        onCreate={({ kind, categoryId }) => {
          setPreference("open");
          setCreateRequest({ sequence: ++sequence.current, kind, categoryId });
        }}
      />
      {compact && expanded && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-[#111827]/25"
          aria-label="Close category explorer"
          onClick={closeExplorer}
        />
      )}
      <div
        id="notespace-library-explorer"
        ref={explorerRef}
        role={compact && expanded ? "dialog" : undefined}
        aria-modal={compact && expanded ? "true" : undefined}
        aria-label={compact && expanded ? "Workspace explorer" : undefined}
        className={`${expanded ? "block" : "hidden"} min-h-0 w-[228px] shrink-0 max-[760px]:fixed max-[760px]:top-0 max-[760px]:bottom-0 max-[760px]:left-11 max-[760px]:z-50 max-[760px]:w-[min(268px,calc(100vw_-_44px))] max-[760px]:shadow-[var(--shadow-popup)]`}
      >
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-sidebar px-3">
          <span className="text-[11px] font-semibold text-ink">Explorer</span>
          <button ref={closeButtonRef} type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-tint hover:text-accent" onClick={closeExplorer} aria-label="Close Explorer" title="Close Explorer"><PanelLeftClose size={15} /></button>
        </div>
        <div className="h-[calc(100%-36px)] min-h-0 overflow-hidden bg-sidebar">
          <LibraryCreateContext.Provider value={createRequest}>{sidebar}</LibraryCreateContext.Provider>
        </div>
      </div>
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <HeaderPlacement className="relative z-30 flex min-h-[46px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4 max-[560px]:gap-2 max-[560px]:px-3">
          <button
            type="button"
            className="flex min-h-8 w-[min(320px,42vw)] min-w-[190px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-ink/70 transition-colors hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[560px]:w-full max-[560px]:min-w-0"
            aria-label="Search Notespace with Control K or Command K"
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}
          >
            <Search size={14} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">Search Notespace</span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">Ctrl/⌘ K</kbd>
          </button>
          {headerActions && <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px] [&>button]:text-ink">{headerActions}</div>}
        </HeaderPlacement>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
