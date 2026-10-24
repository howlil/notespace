import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2 } from "lucide-react";
import type { Workspace, WorkspaceSummary } from "../../domain/workspace/workspace";
import { WorkspacePlan } from "../../features/planning/WorkspacePlan";
import { ActivityTypeTrigger } from "../../features/activity/ActivityTypeTrigger";
import { ActivityIndicator } from "../../features/activity/ActivityIndicator";
import { useTaskActivityStart } from "../../features/activity/use-task-activity-start";
import { useActivityRuntime } from "../../features/activity/activity-runtime-provider";
import { useWorkspaceAuthoring } from "../../features/workspace-authoring/ui/WorkspaceAuthoring";
import { WorkspaceRail } from "../../features/workspace-authoring/ui/WorkspaceRail";
import { IconButton, cn } from "../../shared/ui";
import { useDesktopChrome } from "../../shared/ui/desktop-titlebar/HeaderPlacement";

type Props = {
  workspace: Workspace;
  categoryTitle: string;
  categoryWorkspaces: WorkspaceSummary[];
};

export function WorkspacePage({ workspace }: Props) {
  const { customChromeActive, workspaceRailHost } = useDesktopChrome();
  const activity = useActivityRuntime();
  const startTaskActivity = useTaskActivityStart(activity);
  const { adoptLegacyWorkspace } = activity;
  const [planOpen, setPlanOpen] = useState(false);

  const onWorkspaceActive = useCallback(({ workspaceId, workspaceTitle }: { workspaceId: string; workspaceTitle: string }) => {
    adoptLegacyWorkspace({
      title: workspaceTitle,
      activityType: "learn",
      workspaceId,
      workspaceTitleSnapshot: workspaceTitle,
    });
  }, [adoptLegacyWorkspace]);

  const authoring = useWorkspaceAuthoring({ workspace, onWorkspaceActive });
  const saveLabel = authoring.status.state === "saved"
    ? "Saved"
    : authoring.status.state === "saving"
      ? "Saving…"
      : authoring.status.state === "conflict"
        ? "Conflict"
        : authoring.status.state === "error"
          ? "Not saved"
          : "Unsaved";

  const rail = !authoring.focusMode ? (
    <WorkspaceRail
      activeViewMode={authoring.activeViewMode}
      planActive={planOpen}
      onSelectView={(mode) => { setPlanOpen(false); authoring.selectView(mode); }}
      onPlanSelect={() => { setPlanOpen(true); authoring.clearMaximize(); }}
      onFocus={authoring.toggleActiveMaximize}
      activityControl={<ActivityIndicator rail activity={activity} workspaceId={workspace.id} workspaceTitle={authoring.currentWorkspaceTitle} />}
    />
  ) : null;
  const railHostActive = customChromeActive && workspaceRailHost !== null;

  const visible = planOpen ? (
    <WorkspacePlan
      workspaceId={workspace.id}
      refreshKey={activity.taskRevision}
      renderTaskAction={(task) => (
        <ActivityTypeTrigger
          ariaLabel={`Start activity for ${task.title}`}
          disabled={activity.status !== "idle" || !activity.canStart}
          onSelect={(activityType) => { void startTaskActivity(task, activityType); }}
        />
      )}
    />
  ) : authoring.authoringVisible;

  return (
    <div className="h-dvh min-w-0 overflow-hidden">
      <main className={cn("workspace-main relative flex h-dvh min-h-0 min-w-0 overflow-hidden bg-surface", authoring.focusMode && "is-focus-mode")}>
        {railHostActive ? createPortal(rail, workspaceRailHost) : rail}
        <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex h-auto min-h-0 min-w-0 flex-1 overflow-hidden p-0">{visible}</div>
          {authoring.focusMode && (
            <IconButton type="button" className="absolute bottom-2 left-2 z-40 !size-8 border border-line bg-surface text-muted hover:bg-tint hover:text-accent" aria-label="Restore layout" title="Restore layout" onClick={authoring.clearMaximize}>
              <Maximize2 size={17} aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <span className="sr-only" role="status" aria-label="Workspace save status" aria-live="polite" aria-atomic="true">{saveLabel}</span>
      </main>
      {authoring.overlays}
    </div>
  );
}
