import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { useNavigate } from "@tanstack/react-router";
import { useTaskActivityStart } from "../../features/activity/use-task-activity-start";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import type { CategorySummary } from "../../domain/workspace/workspace";
import type { TodayProjection } from "../../domain/planning/planning";
import { useLibraryCategories } from "../../features/library/use-library-categories";
import { useActivityRuntime } from "../../features/activity/activity-runtime-provider";
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
  const startTaskActivity = useTaskActivityStart(activity);

  return (
    <LibraryPageShell page="today"
      sidebar={<LibrarySidebar categories={categoryItems} todayActive onChanged={refreshCategories}
        onSelectCategory={(categoryId) => { void navigate({ to: "/", search: { category: categoryId } }); }} />}
    >
      <TodayPlanning initial={initial} refreshKey={activity.taskRevision}
        renderTaskAction={(task) => (
          <ActivityTypeTrigger ariaLabel={`Start activity for ${task.title}`}
            disabled={activity.status !== "idle" || !activity.canStart || !task.workspaceId}
            disabledTitle={!task.workspaceId ? "Move this task to a Workspace before starting Activity" : "End the active activity first"}
            onSelect={(activityType) => { void startTaskActivity(task, activityType); }} />
        )}
      />
    </LibraryPageShell>
  );
}
