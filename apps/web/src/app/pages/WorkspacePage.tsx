import { useCallback, useEffect, useRef } from "react";
import type { CategorySummary, Workspace } from "../../entities/workspace";
import { useStore } from "../../shared/lib/use-store";
import { appShellStore, toggleCanvasFullMode } from "../shell/app-shell-store";
import {
  registerActiveCanvasNotePlacer,
  registerActiveWorkspaceSession,
  updateActiveWorkspaceVersion,
} from "../shell/active-workspace-store";
import { useWorkspaceAuthoring } from "../../modules/workspace";

type Props = {
  workspace: Workspace;
  categories: CategorySummary[];
  focusNoteId?: string;
  focusBlockId?: string;
  focusNonce?: string;
};

export function WorkspacePage({ workspace, focusNoteId, focusBlockId, focusNonce }: Props) {
  return (
    <WorkspaceAuthoringSession
      key={workspace.id}
      workspace={workspace}
      focusNoteId={focusNoteId}
      focusBlockId={focusBlockId}
      focusNonce={focusNonce}
    />
  );
}

function WorkspaceAuthoringSession({ workspace, focusNoteId, focusBlockId, focusNonce }: {
  workspace: Workspace;
  focusNoteId?: string;
  focusBlockId?: string;
  focusNonce?: string;
}) {
  const fullMode = useStore(appShellStore, (state) => state.canvasFullMode);
  const authoring = useWorkspaceAuthoring({
    workspace,
    focusNoteId,
    focusBlockId,
    focusNonce,
    fullMode,
    onToggleFullMode: toggleCanvasFullMode,
    onRegisterNotePlacer: registerActiveCanvasNotePlacer,
  });
  const prepareRef = useRef(authoring.prepareForDestructiveAction);
  prepareRef.current = authoring.prepareForDestructiveAction;
  const prepareForDestructiveAction = useCallback(() => prepareRef.current(), []);
  const saveLabel = authoring.status.state === "saved" ? "Saved"
    : authoring.status.state === "saving" ? "Saving…"
    : authoring.status.state === "conflict" ? "Conflict"
    : authoring.status.state === "error" ? "Not saved" : "Unsaved";

  useEffect(() => registerActiveWorkspaceSession({
    workspaceId: workspace.id,
    version: workspace.version,
    prepareForDestructiveAction,
  }), [prepareForDestructiveAction, workspace.id, workspace.version]);

  useEffect(() => {
    updateActiveWorkspaceVersion(workspace.id, authoring.currentWorkspaceVersion);
  }, [authoring.currentWorkspaceVersion, workspace.id]);

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden" aria-label={authoring.currentWorkspaceTitle}>
      {authoring.authoringVisible}
      <span className="sr-only" role="status" aria-label="Workspace save status"
        aria-live="polite" aria-atomic="true">{saveLabel}</span>
      {authoring.overlays}
    </div>
  );
}
