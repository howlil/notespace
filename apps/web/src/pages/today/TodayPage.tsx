import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import type { CategorySummary } from "../../domain/workspace/workspace";
import type { TodayProjection, TodayTask } from "../../domain/planning/planning";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import { ThemeToggle } from "../../shared/ui/theme-provider";
import { useLibraryCategories } from "../../features/library/use-library-categories";
import { useActivityRuntime } from "../../features/activity/activity-runtime-provider";
import { ActivityQuickStart } from "../../features/activity/ActivityQuickStart";
import { ActivityTypeTrigger } from "../../features/activity/ActivityTypeTrigger";
import { TodayPlanning } from "../../features/planning/TodayPlanning";

export function TodayPage({
  categories,
  initial,
}: {
  categories: CategorySummary[];
  initial: TodayProjection;
}) {
  const navigate = useNavigate();
  const { categories: categoryItems, refreshCategories } = useLibraryCategories(categories);
  const activity = useActivityRuntime();

  function startTaskActivity(task: TodayTask, activityType: Parameters<typeof activity.start>[0] extends infer T
    ? T extends { activityType: infer A } ? A : never
    : never) {
    if (!activity.canStart) return;
    activity.start({
      title: task.title,
      activityType,
      taskId: task.id,
      taskTitleSnapshot: task.title,
      ...(task.workspaceId ? { workspaceId: task.workspaceId } : {}),
      ...(task.workspaceTitle ? { workspaceTitleSnapshot: task.workspaceTitle } : {}),
    });
  }

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,224px)_minmax(0,1fr)] bg-background max-[560px]:grid-cols-[minmax(0,1fr)]">
      <LibrarySidebar
        categories={categoryItems}
        todayActive
        onChanged={refreshCategories}
        onSelectCategory={(categoryId) => {
          void navigate({ to: "/categories/$categoryId", params: { categoryId } });
        }}
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
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
              Search Notespace
            </span>
            <kbd className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] font-medium text-ink/60">
              Ctrl/⌘ K
            </kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-1 [&>button]:size-[30px]">
            <ThemeToggle />
          </div>
        </header>

        <TodayPlanning
          initial={initial}
          refreshKey={activity.taskRevision}
          renderActivity={<ActivityQuickStart />}
          renderTaskAction={(task) => (
            <ActivityTypeTrigger
              ariaLabel={`Start activity for ${task.title}`}
              disabled={activity.status !== "idle" || !activity.canStart}
              onSelect={(activityType) => startTaskActivity(task, activityType)}
            />
          )}
        />
      </main>
    </div>
  );
}
