import { useCallback } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HeaderPlacement } from "../../shared/ui/desktop-titlebar/HeaderPlacement";
import { OPEN_QUICK_SEARCH_EVENT } from "../../features/search/quick-search-events";
import type { Workspace, WorkspaceSummary } from "../../domain/workspace/workspace";
import { ActivityIndicator } from "../../features/activity/ActivityIndicator";
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
  const { adoptLegacyWorkspace } = activity;

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
      showBack={!customChromeActive}
      activeViewMode={authoring.activeViewMode}
      onSelectView={(mode) => authoring.selectView(mode)}
      onFocus={authoring.toggleActiveMaximize}
      activityControl={<ActivityIndicator rail activity={activity} workspaceId={workspace.id} workspaceTitle={authoring.currentWorkspaceTitle} />}
    />
  ) : null;
  const railHostActive = customChromeActive && workspaceRailHost !== null;

  const visible = authoring.authoringVisible;

  return (
    <div className="h-dvh min-w-0 overflow-hidden">
      {customChromeActive && (
        <HeaderPlacement className="notespace-workspace-titlebar flex min-h-[37px] items-center px-3">
          <Link to="/" className="inline-flex min-h-7 min-w-0 max-w-[38%] items-center gap-2 rounded-md px-2 text-[11px] font-semibold text-ink hover:bg-tint" aria-label="Back to library">
            <ArrowLeft size={16} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{authoring.currentWorkspaceTitle}</span>
          </Link>
          <button type="button" className="notespace-titlebar-search flex h-7 w-[min(320px,42vw)] items-center gap-2 rounded-md border border-line bg-canvas px-2.5 text-left text-[11px] text-muted hover:bg-tint hover:text-accent"
            aria-label="Search Notespace with Control K or Command K"
            onClick={() => window.dispatchEvent(new Event(OPEN_QUICK_SEARCH_EVENT))}>
            <Search size={14} aria-hidden="true" /><span className="truncate">Search Notespace</span>
            <kbd className="ml-auto shrink-0 text-[9px]">Ctrl/⌘ K</kbd>
          </button>
        </HeaderPlacement>
      )}
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
