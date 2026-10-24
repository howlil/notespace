import { useRef } from "react";
import { getAnyTask } from "../../adapters/http/planning-api";
import { getWorkspace } from "../../adapters/http/workspace-api";
import type { TodayTask } from "../../domain/planning/planning";
import type { ActivityType } from "../../domain/activity/activity";
import { useToast } from "../../shared/ui/toast-provider";
import type { ActivityRuntimeState } from "./activity-runtime-provider";

/** Validates the current Task owner before creating a Workspace-owned Activity. */
export function useTaskActivityStart(activity: ActivityRuntimeState) {
  const { showToast } = useToast();
  const starting = useRef(false);
  return async (task: TodayTask, activityType: ActivityType) => {
    if (!activity.canStart || starting.current || !task.workspaceId) return;
    starting.current = true;
    try {
      const current = await getAnyTask(task.id);
      if (!current.workspaceId || current.completedAt) {
        showToast({ kind: "error", message: "Assign this Task to a Workspace or choose an open Task before starting Activity." });
        return;
      }
      const workspace = await getWorkspace(current.workspaceId);
      if (!activity.canStart) return;
      activity.start({
        title: current.title,
        activityType,
        taskId: current.id,
        taskTitleSnapshot: current.title,
        workspaceId: workspace.id,
        workspaceTitleSnapshot: workspace.title,
      });
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Unable to verify Task and Workspace for Activity." });
    } finally {
      starting.current = false;
    }
  };
}
