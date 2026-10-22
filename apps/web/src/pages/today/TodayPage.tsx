import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { useNavigate } from "@tanstack/react-router";
import { LibrarySidebar } from "../_shared/LibrarySidebar";
import type { CategorySummary } from "../../domain/workspace/workspace";
import type { TodayProjection, TodayTask } from "../../domain/planning/planning";
import type { ActivityType } from "../../domain/activity/activity";
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

  function startTaskActivity(task: TodayTask, activityType: ActivityType) {
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
    <LibraryPageShell page="today"
      sidebar={<LibrarySidebar categories={categoryItems} todayActive onChanged={refreshCategories}
        onSelectCategory={(categoryId) => { void navigate({ to: "/", search: { category: categoryId } }); }} />}
    >
      <TodayPlanning initial={initial} refreshKey={activity.taskRevision}
        renderActivity={<ActivityQuickStart />}
        renderTaskAction={(task) => (
          <ActivityTypeTrigger ariaLabel={`Start activity for ${task.title}`}
            disabled={activity.status !== "idle" || !activity.canStart}
            onSelect={(activityType) => startTaskActivity(task, activityType)} />
        )}
      />
    </LibraryPageShell>
  );
}
