import { useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, Circle, Loader2, Maximize2, Pencil } from "lucide-react";
import type { Workspace, WorkspaceSummary } from "../../domain/workspace/workspace";
import { WorkspacePlan } from "../../features/planning/WorkspacePlan";
import { ActivityTypeTrigger } from "../../features/activity/ActivityTypeTrigger";
import { ActivityIndicator } from "../../features/activity/ActivityIndicator";
import { useActivityRuntime } from "../../features/activity/activity-runtime-provider";
import { useWorkspaceAuthoring } from "../../features/workspace-authoring/ui/WorkspaceAuthoring";
import { WorkspaceGuide } from "../../features/workspace-authoring/ui/WorkspaceGuide";
import { WorkspaceRenameField } from "../../features/workspace-authoring/ui/WorkspaceRenameField";
import { WorkspaceViewSwitcher } from "../../features/workspace-authoring/ui/WorkspaceViewSwitcher";
import { iconActionClass, paneMenuButtonClass, popupClass } from "../../features/workspace-authoring/ui/workspace-ui-classes";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, IconButton, cn } from "../../shared/ui";

type Props = {
  workspace: Workspace;
  categoryTitle: string;
  categoryWorkspaces: WorkspaceSummary[];
};

export function WorkspacePage({ workspace, categoryTitle, categoryWorkspaces }: Props) {
  const navigate = useNavigate();
  const activity = useActivityRuntime();
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
  const workspaceOptions = [
    { ...workspace, title: authoring.workspaceTitle },
    ...categoryWorkspaces.filter((candidate) => candidate.id !== workspace.id),
  ];

  const saveFailed = authoring.status.state === "error" || authoring.status.state === "conflict";
  const saveLabel = authoring.status.state === "saved"
    ? "Saved"
    : authoring.status.state === "saving"
      ? "Saving…"
      : authoring.status.state === "conflict"
        ? "Conflict"
        : authoring.status.state === "error"
          ? "Not saved"
          : "Unsaved";

  const visible = planOpen ? (
    <WorkspacePlan
      workspaceId={workspace.id}
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
              workspaceId: workspace.id,
              workspaceTitleSnapshot: authoring.currentWorkspaceTitle,
            });
          }}
        />
      )}
    />
  ) : authoring.authoringVisible;

  return (
    <div className="h-dvh min-w-0 overflow-hidden">
      <main className={cn("workspace-main flex h-dvh min-h-0 min-w-0 flex-col [--workspace-header-height:44px] max-[560px]:[--workspace-header-height:76px]", authoring.focusMode && "is-focus-mode")}>
        <header className={cn("workspace-header relative flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3 max-[800px]:px-2 max-[560px]:grid max-[560px]:min-h-[76px] max-[560px]:grid-cols-[minmax(0,1fr)_auto] max-[560px]:grid-rows-[30px_32px] max-[560px]:items-center max-[560px]:gap-x-2 max-[560px]:gap-y-1 max-[560px]:px-2 max-[560px]:py-1.5", authoring.focusMode && "hidden")}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 max-[560px]:order-none max-[560px]:col-span-2 max-[560px]:col-start-1 max-[560px]:row-start-1 max-[560px]:w-full max-[560px]:gap-1">
            <Link to="/" className={iconActionClass} aria-label="Back to library" title="Back to library"><ArrowLeft size={24} /></Link>
            <span className="max-w-[24vw] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted max-[760px]:hidden">{categoryTitle} /</span>
            <div className="flex min-w-0 max-w-[min(32vw,360px)] flex-1 items-center gap-0.5 max-[800px]:w-[34vw] max-[800px]:max-w-[34vw] max-[560px]:min-w-0 max-[560px]:w-auto max-[560px]:max-w-none max-[560px]:flex-1">
              <ContextMenu>
                {authoring.renamingWorkspace ? (
                  <WorkspaceRenameField
                    inputRef={authoring.workspaceRenameInput}
                    value={authoring.workspaceTitleDraft}
                    disabled={authoring.workspaceRenamePending}
                    onChange={authoring.setWorkspaceTitleDraft}
                    onCommit={authoring.commitRenameWorkspace}
                    onCancel={authoring.cancelRenameWorkspace}
                  />
                ) : (
                  <details className="workspace-switcher relative min-w-0 flex-1 [&>summary::-webkit-details-marker]:hidden">
                    <ContextMenuTrigger asChild>
                      <summary className="flex h-7 min-w-0 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" aria-label="Switch workspace" onDoubleClick={(event) => { event.preventDefault(); authoring.beginRenameWorkspace(); }}>
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{authoring.workspaceTitle}</span>
                        <ChevronDown size={13} className="shrink-0 text-muted" aria-hidden="true" />
                      </summary>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={authoring.beginRenameWorkspace}><Pencil size={13} /> Rename workspace</ContextMenuItem>
                    </ContextMenuContent>
                    <div className={cn(popupClass, "top-7 left-0")} role="listbox" aria-label="Workspaces in this category">
                      {workspaceOptions.map((option) => (
                        <Button
                          key={option.id}
                          variant="ghost"
                          size="sm"
                          className={cn("!min-h-0 w-full justify-start whitespace-nowrap", paneMenuButtonClass, option.id === workspace.id && "bg-tint text-accent")}
                          role="option"
                          aria-selected={option.id === workspace.id}
                          onClick={(event) => {
                            const details = event.currentTarget.closest("details");
                            if (details) details.open = false;
                            if (option.id !== workspace.id) void navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: option.id } });
                          }}
                        >
                          {option.title}
                        </Button>
                      ))}
                    </div>
                  </details>
                )}
              </ContextMenu>
            </div>
          </div>

          <WorkspaceViewSwitcher
            activeViewMode={authoring.activeViewMode}
            planActive={planOpen}
            onSelect={(mode) => {
              setPlanOpen(false);
              authoring.selectView(mode);
            }}
            onPlanSelect={() => {
              setPlanOpen(true);
              authoring.clearMaximize();
            }}
          />

          <div className="flex items-center gap-1 max-[760px]:gap-0.5 max-[560px]:order-none max-[560px]:col-start-2 max-[560px]:row-start-2 max-[560px]:w-auto max-[560px]:justify-self-end max-[560px]:overflow-visible max-[560px]:pb-0 max-[560px]:[&>*]:shrink-0">
            <ActivityIndicator activity={activity} workspaceId={workspace.id} workspaceTitle={authoring.currentWorkspaceTitle} />
            <span className={cn("flex items-center gap-1 whitespace-nowrap text-[10px] text-muted max-[800px]:gap-0 max-[800px]:text-[0px]", saveFailed && "text-danger", authoring.status.state === "saved" && "[&_svg]:text-success")} role="status" aria-live="polite">
              {authoring.status.state === "saved" ? <Check size={20} /> : authoring.status.state === "saving" ? <Loader2 size={20} className="animate-spin" /> : <Circle size={10} />}
              {saveLabel}
            </span>
            {!planOpen && <IconButton type="button" className={iconActionClass} onClick={authoring.toggleActiveMaximize} aria-label={authoring.maximizeLabel} title={authoring.maximizeLabel}><Maximize2 size={24} /></IconButton>}
            <WorkspaceGuide />
          </div>
        </header>

        <div className={cn("flex h-auto min-h-0 flex-1 overflow-hidden p-3 max-[760px]:p-[7px]", authoring.focusMode && "p-0")}>{visible}</div>
      </main>
      {authoring.overlays}
    </div>
  );
}
