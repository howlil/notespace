import { useCallback } from "react";
import type { Workspace, WorkspaceSummary } from "../../domain/workspace/workspace";
import { WorkspacePlan } from "../../features/planning/WorkspacePlan";
import { ActivityTypeTrigger } from "../../features/activity/ActivityTypeTrigger";
import { ActivityIndicator } from "../../features/activity/ActivityIndicator";
import { useActivityRuntime } from "../../features/activity/activity-runtime-provider";
import { WorkspaceAuthoring } from "../../features/workspace-authoring/ui/WorkspaceAuthoring";

type Props = {
  workspace: Workspace;
  categoryTitle: string;
  categoryWorkspaces: WorkspaceSummary[];
};

export function WorkspacePage({ workspace, categoryTitle, categoryWorkspaces }: Props) {
  const activity = useActivityRuntime();
  const { adoptLegacyWorkspace } = activity;

  const onWorkspaceActive = useCallback(({ workspaceId, workspaceTitle }: { workspaceId: string; workspaceTitle: string }) => {
    adoptLegacyWorkspace({
      title: workspaceTitle,
      activityType: "learn",
      workspaceId,
      workspaceTitleSnapshot: workspaceTitle,
    });
  }, [adoptLegacyWorkspace]);

  return (
    <WorkspaceAuthoring
      workspace={workspace}
      categoryTitle={categoryTitle}
      categoryWorkspaces={categoryWorkspaces}
      onWorkspaceActive={onWorkspaceActive}
      renderPlan={({ workspaceId, workspaceTitle }) => (
        <WorkspacePlan
          workspaceId={workspaceId}
          refreshKey={activity.taskRevision}
          renderTaskAction={(task) => (
            <ActivityTypeTrigger
              ariaLabel={`Start activity for ${task.title}`}
              disabled={activity.status !== "idle" || !activity.canStart}
              onSelect={(activityType) => {
                activity.start({
                  title: task.title,
                  activityType,
                  taskId: task.id,
                  taskTitleSnapshot: task.title,
                  workspaceId,
                  workspaceTitleSnapshot: workspaceTitle,
                });
              }}
            />
          )}
        />
      )}
      renderActivityIndicator={({ workspaceId, workspaceTitle }) => (
        <ActivityIndicator activity={activity} workspaceId={workspaceId} workspaceTitle={workspaceTitle} />
      )}
    />
  );
}
