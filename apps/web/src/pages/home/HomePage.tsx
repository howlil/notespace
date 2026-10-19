import { Search } from "lucide-react";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import { ThemeToggle } from "../../shared/ui/theme-provider";
import type { CategorySummary, WorkspacePage, WorkspaceSummary } from "../../domain/workspace/workspace";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { ActivityDashboard } from "../../features/activity/ActivityDashboard";
import { WorkspaceGuide } from "../../features/workspace-authoring/ui/WorkspaceGuide";
import { WorkspaceLibrary } from "../../features/library/WorkspaceLibrary";
import { useWorkspaceLibrary } from "../../features/library/use-workspace-library";

type Props = {
  categories: CategorySummary[];
  recentWorkspaces: WorkspaceSummary[];
  initialSelectedCategoryId?: string;
  initialCategoryPage?: WorkspacePage;
};

const showActivityDashboard = false;

export function HomePage(props: Props) {
  const library = useWorkspaceLibrary(props);

  return (
    <div className="dashboard-shell grid min-h-dvh grid-cols-[minmax(0,224px)_minmax(0,1fr)] max-[560px]:grid-cols-[minmax(0,1fr)]">
      <LibrarySidebar
        categories={library.categoryItems}
        selectedCategoryId={library.selectedCategoryId}
        onSelectCategory={(id) => { void library.selectCategory(id); }}
        onChanged={library.refreshLibrary}
      />
      <main className="min-h-dvh min-w-0 max-[560px]:min-h-0">
        <header className="relative z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 max-[560px]:gap-2 max-[560px]:px-3">
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
          <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px] [&>button]:text-ink max-[560px]:[&>button]:size-[32px]">
            <WorkspaceGuide />
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-[1240px] px-6 pt-5 pb-8 max-[800px]:px-5 max-[800px]:pt-5 max-[800px]:pb-7 max-[560px]:p-4 max-[560px]:pt-4">
          <WorkspaceLibrary model={library} afterList={showActivityDashboard ? <ActivityDashboard /> : null} />
        </div>
      </main>
    </div>
  );
}
