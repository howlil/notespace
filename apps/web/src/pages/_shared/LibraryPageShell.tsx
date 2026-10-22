import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { HeaderPlacement } from "../../shared/ui/desktop-titlebar/HeaderPlacement";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  dashboard?: boolean;
};

/** One stable page shell for Library, Inbox and Today; each page owns its own data and actions. */
export function LibraryPageShell({ sidebar, children, headerActions, dashboard = false }: Props) {
  return (
    <div className={`${dashboard ? "dashboard-shell " : ""}grid min-h-dvh grid-cols-[minmax(0,224px)_minmax(0,1fr)] bg-background max-[560px]:grid-cols-[minmax(0,1fr)]`}>
      {sidebar}
      <main className="min-h-dvh min-w-0 max-[560px]:min-h-0">
        <HeaderPlacement className="relative z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 max-[560px]:gap-2 max-[560px]:px-3">
          <button
            type="button"
            className="flex min-h-9 w-[min(320px,42vw)] min-w-[190px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-ink/70 transition-colors hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[560px]:min-h-8 max-[560px]:w-full max-[560px]:min-w-0"
            aria-label="Search Notespace with Control K or Command K"
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}
          >
            <Search size={15} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">Search Notespace</span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">Ctrl/⌘ K</kbd>
          </button>
          {headerActions && <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px] [&>button]:text-ink max-[560px]:[&>button]:size-[32px]">{headerActions}</div>}
        </HeaderPlacement>
        {children}
      </main>
    </div>
  );
}
