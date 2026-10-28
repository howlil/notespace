import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { HeaderPlacement } from "../../shared/ui/desktop-titlebar/HeaderPlacement";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";

type Props = {
  sidebar: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  dashboard?: boolean;
  page?: "library" | "inbox" | "today";
  selectedCategoryId?: string;
};

/** One fixed Explorer; editor navigation remains owned by WorkspaceRail. */
export function LibraryPageShell({ sidebar, children, headerActions, dashboard = false }: Props) {
  return (
    <div className={`${dashboard ? "dashboard-shell " : ""}flex h-dvh min-h-0 min-w-0 overflow-hidden bg-background`}>
      <div id="notespace-home-sidebar" className="h-full min-h-0 w-[228px] shrink-0 overflow-hidden border-r border-line bg-sidebar">
        {sidebar}
      </div>
      <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <HeaderPlacement className="relative z-30 flex min-h-[46px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4 max-[560px]:gap-2 max-[560px]:px-3">
          <button type="button" className="notespace-titlebar-search flex min-h-8 w-[min(320px,42vw)] min-w-[120px] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-ink/70 hover:border-accent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Search Notespace with Control K or Command K"
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}>
            <Search size={14} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">Search Notespace</span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">Ctrl/⌘ K</kbd>
          </button>
          {headerActions && <div className="ml-auto flex shrink-0 items-center gap-1">{headerActions}</div>}
        </HeaderPlacement>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
