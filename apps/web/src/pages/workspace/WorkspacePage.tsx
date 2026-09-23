import { useCallback } from "react";
import type { Workspace, WorkspaceSummary } from "../../domain/workspace/workspace";
import { WorkspacePlan } from "../../features/plan/WorkspacePlan";
import { ActivityTypeTrigger } from "../../features/study/ActivityTypeTrigger";
import { StudyIndicator } from "../../features/study/StudyIndicator";
import { useActivityRuntime } from "../../features/study/activity-runtime-provider";
import { WorkspaceAuthoring } from "../../features/workspace-authoring/ui/WorkspaceAuthoring";

type Props = {
  workspace: Workspace;
  categoryTitle: string;
  categoryWorkspaces: WorkspaceSummary[];
};

export function WorkspacePage({ workspace, categoryTitle, categoryWorkspaces }: Props) {
  const study = useActivityRuntime();
  const { adoptLegacyWorkspace } = study;

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
          refreshKey={study.taskRevision}
          renderTaskAction={(task) => (
            <ActivityTypeTrigger
              ariaLabel={`Start activity for ${task.title}`}
              disabled={study.status !== "idle" || !study.canStart}
              onSelect={(activityType) => {
                study.start({
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
        <StudyIndicator study={study} workspaceId={workspaceId} workspaceTitle={workspaceTitle} />
      )}
    />
  );
}
