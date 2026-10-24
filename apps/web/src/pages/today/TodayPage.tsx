import { LibraryPageShell } from "../_shared/LibraryPageShell";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { getAnyTask } from "../../adapters/http/planning-api";
import { getWorkspace } from "../../adapters/http/workspace-api";
import { useToast } from "../../shared/ui/toast-provider";
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
  const { showToast } = useToast();
  const startingTask = useRef(false);

  async function startTaskActivity(task: TodayTask, activityType: ActivityType) {
    if (!activity.canStart || startingTask.current || !task.workspaceId) return;
    startingTask.current = true;
    try {
      const latest = await getAnyTask(task.id);
      if (!latest.workspaceId || latest.completedAt) {
        showToast({ kind: "error", message: "Assign this Task to a Workspace or choose an open Task before starting Activity." });
        return;
      }
      const workspace = await getWorkspace(latest.workspaceId);
      if (!activity.canStart) return;
      activity.start({
        title: latest.title,
        activityType,
        taskId: latest.id,
        taskTitleSnapshot: latest.title,
        workspaceId: workspace.id,
        workspaceTitleSnapshot: workspace.title,
      });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to verify Task and Workspace for Activity." });
    } finally {
      startingTask.current = false;
    }
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
            disabled={activity.status !== "idle" || !activity.canStart || !task.workspaceId}
            disabledTitle={!task.workspaceId ? "Assign this legacy Task to a Workspace first" : "End the active activity first"}
            onSelect={(activityType) => { void startTaskActivity(task, activityType); }} />
        )}
      />
    </LibraryPageShell>
  );
}
