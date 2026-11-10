import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { CategorySummary, Workspace } from "../../domain/workspace/workspace";
import { LibraryPageShell } from "../shell/LibraryPageShell";
import { LibrarySidebar } from "../../features/library";
import { useWorkspaceAuthoring } from "../../features/workspace-authoring";

type Props = {
  workspace: Workspace;
  categories: CategorySummary[];
  focusNoteId?: string;
};

type WorkspaceSessionHandle = {
  workspaceId: string;
  prepareForDestructiveAction: () => Promise<boolean>;
};

export function WorkspacePage({ workspace, categories, focusNoteId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const sessionRef = useRef<WorkspaceSessionHandle | null>(null);
  const registerSession = useCallback((session: WorkspaceSessionHandle | null) => {
    sessionRef.current = session;
  }, []);
  const beforeDeleteWorkspace = useCallback((workspaceId: string) => {
    if (workspaceId !== workspace.id) return Promise.resolve(true);
    const session = sessionRef.current;
    return session?.workspaceId === workspaceId ? session.prepareForDestructiveAction() : Promise.resolve(false);
  }, [workspace.id]);

  return (
    <LibraryPageShell canvas workspaceTitle={workspace.title}
      sidebar={<LibrarySidebar categories={categories}
         selectedCategoryId={workspace.categoryId}
         activeWorkspace={workspace}
         onSelectCategory={(category) => { void navigate({ to: "/", search: { category } }); }}
         onBeforeDeleteWorkspace={beforeDeleteWorkspace}
         onChanged={(change) => {
           if (change?.kind === "workspace-deleted" && change.workspaceId === workspace.id) void navigate({ to: "/" });
           else void router.invalidate();
         }} />}>
      <WorkspaceAuthoringSession key={workspace.id} workspace={workspace} focusNoteId={focusNoteId} onSessionChange={registerSession} />
    </LibraryPageShell>
  );
}

function WorkspaceAuthoringSession({ workspace, focusNoteId, onSessionChange }: {
  workspace: Workspace;
  focusNoteId?: string;
  onSessionChange: (session: WorkspaceSessionHandle | null) => void;
}) {
  const authoring = useWorkspaceAuthoring({ workspace, focusNoteId });
  const prepareRef = useRef(authoring.prepareForDestructiveAction);
  prepareRef.current = authoring.prepareForDestructiveAction;
  const prepareForDestructiveAction = useCallback(() => prepareRef.current(), []);
  const saveLabel = authoring.status.state === "saved" ? "Saved"
    : authoring.status.state === "saving" ? "Saving…"
    : authoring.status.state === "conflict" ? "Conflict"
    : authoring.status.state === "error" ? "Not saved" : "Unsaved";

  useEffect(() => {
    onSessionChange({ workspaceId: workspace.id, prepareForDestructiveAction });
    return () => onSessionChange(null);
  }, [onSessionChange, prepareForDestructiveAction, workspace.id]);

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden" aria-label={authoring.currentWorkspaceTitle}>
      {authoring.authoringVisible}
      <span className="sr-only" role="status" aria-label="Workspace save status"
        aria-live="polite" aria-atomic="true">{saveLabel}</span>
      {authoring.overlays}
    </div>
  );
}
