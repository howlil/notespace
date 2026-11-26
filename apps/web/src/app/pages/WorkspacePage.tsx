import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Workspace } from "../../entities/workspace";
import { useStore } from "../../shared/lib/use-store";
import { AnchoredPopover } from "../../shared/ui";
import { collapseAncestors } from "../../modules/library";
import { appShellStore, toggleCanvasFullMode } from "../shell/app-shell-store";
import { openWorkspaceFromCanvas } from "../shell/PersistentAppShell";
import { closeRightDock, openNoteInSideCards, openRightDockMode, rightDockStore, selectDockNote } from "../shell/right-dock-store";
import { TabHistoryControls } from "../shell/TabHistoryControls";
import {
  consumePendingPlaceNote,
  registerActiveCanvasFocusHandlers,
  registerActiveCanvasNotePlacer,
  registerActiveWorkspaceSession,
  requestPlaceNoteOnActiveCanvas,
  setActiveCanvasOutlineItems,
  updateActiveWorkspaceVersion,
} from "../shell/active-workspace-store";
import { useWorkspaceAuthoring } from "../../modules/workspace";

type Props = {
  workspace: Workspace;
  workspaceTitles?: Record<string, string>;
  focusNoteId?: string;
  focusBlockId?: string;
  focusSectionId?: string;
  focusNonce?: string;
};

export function WorkspacePage({ workspace, workspaceTitles, focusNoteId, focusBlockId, focusSectionId, focusNonce }: Props) {
  return (
    <WorkspaceAuthoringSession
      key={workspace.id}
      workspace={workspace}
      workspaceTitles={workspaceTitles}
      focusNoteId={focusNoteId}
      focusBlockId={focusBlockId}
      focusSectionId={focusSectionId}
      focusNonce={focusNonce}
    />
  );
}

function CanvasBreadcrumb({
  workspace,
  currentTitle,
}: {
  workspace: Workspace;
  currentTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const ancestors = workspace.ancestors ?? [];
  const { leading, collapsed, trailing } = collapseAncestors(ancestors, 2);

  return (
    <div
      className="pointer-events-auto absolute top-0 z-10 flex h-8 max-w-[calc(100%-160px)] items-center gap-1 bg-transparent px-0.5 text-[12px] text-muted max-[760px]:left-11"
      style={{ left: "calc(12px + var(--desktop-top-left-inset, 0px))" }}
    >
      <TabHistoryControls />
      <span className="mx-0.5 h-3.5 w-px bg-line" aria-hidden="true" />
      <nav aria-label="Workspace breadcrumb" className="flex min-w-0 items-center gap-0.5">
        <Link
          to="/map"
          search={{}}
          className="shrink-0 rounded px-1 py-0.5 text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
        >
          Workspace Map
        </Link>
      {leading.map((item) => (
        <span key={item.id} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight size={11} className="shrink-0 opacity-60" aria-hidden="true" />
          <Link
            to="/workspaces/$workspaceId"
            params={{ workspaceId: item.id }}
            search={{ noteId: undefined }}
            className="max-w-[140px] truncate rounded px-1 py-0.5 text-muted transition-colors hover:bg-tint hover:text-ink"
          >
            {item.title}
          </Link>
        </span>
      ))}
      {collapsed.length > 0 && (
        <span className="flex items-center gap-0.5">
          <ChevronRight size={11} className="shrink-0 opacity-60" aria-hidden="true" />
          <button
            ref={moreRef}
            type="button"
            className="rounded px-1 py-0.5 text-muted transition-colors hover:bg-tint hover:text-ink"
            aria-label="More ancestor workspaces"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            …
          </button>
          <AnchoredPopover
            open={open}
            anchorRef={moreRef}
            onClose={() => setOpen(false)}
            width={190}
            height={Math.min(220, collapsed.length * 32 + 12)}
            preferredAxis="vertical"
            horizontalAlignment="start"
            aria-label="Ancestor workspaces"
          >
            <div className="grid gap-0.5 p-1">
              {collapsed.map((item) => (
                <Link
                  key={item.id}
                  to="/workspaces/$workspaceId"
                  params={{ workspaceId: item.id }}
                  search={{ noteId: undefined }}
                  onClick={() => setOpen(false)}
                  className="truncate rounded-md px-2 py-1 text-[12px] text-ink hover:bg-tint hover:text-accent"
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </AnchoredPopover>
        </span>
      )}
      {trailing.map((item) => (
        <span key={item.id} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight size={11} className="shrink-0 opacity-60" aria-hidden="true" />
          <Link
            to="/workspaces/$workspaceId"
            params={{ workspaceId: item.id }}
            search={{ noteId: undefined }}
            className="max-w-[140px] truncate rounded px-1 py-0.5 text-muted transition-colors hover:bg-tint hover:text-ink"
          >
            {item.title}
          </Link>
        </span>
      ))}
      <ChevronRight size={11} className="shrink-0 opacity-60" aria-hidden="true" />
      <span className="max-w-[180px] truncate px-1 font-medium text-ink" aria-current="page">
        {currentTitle}
      </span>
      </nav>
    </div>
  );
}

function WorkspaceAuthoringSession({ workspace, workspaceTitles, focusNoteId, focusBlockId, focusSectionId, focusNonce }: {
  workspace: Workspace;
  workspaceTitles?: Record<string, string>;
  focusNoteId?: string;
  focusBlockId?: string;
  focusSectionId?: string;
  focusNonce?: string;
}) {
  const navigate = useNavigate();
  const fullMode = useStore(appShellStore, (state) => state.canvasFullMode);
  const rightPanelOpen = useStore(rightDockStore, (state) => state.open);
  const handleToggleRightPanel = useCallback(() => {
    const snap = rightDockStore.getSnapshot();
    if (snap.open) closeRightDock();
    else openRightDockMode(snap.mode);
  }, []);
  const titleMap = useMemo(() => new Map(Object.entries(workspaceTitles ?? {})), [workspaceTitles]);
  const handleRegisterNotePlacer = useCallback((placer: Parameters<typeof registerActiveCanvasNotePlacer>[0]) => {
    const cleanup = registerActiveCanvasNotePlacer(placer);
    const pendingNoteId = consumePendingPlaceNote(workspace.id);
    if (pendingNoteId) {
      window.setTimeout(() => {
        requestPlaceNoteOnActiveCanvas(pendingNoteId);
      }, 60);
    }
    return cleanup;
  }, [workspace.id]);
  const handleOpenInSideCards = useCallback((noteId: string) => {
    openNoteInSideCards(noteId, { focusDock: true });
  }, []);
  const handleOpenWorkspaceShortcut = useCallback((targetWorkspaceId: string, options?: { background?: boolean }) => {
    const title = titleMap.get(targetWorkspaceId);
    const shouldNavigate = openWorkspaceFromCanvas(targetWorkspaceId, title, Boolean(options?.background));
    if (shouldNavigate) {
      void navigate({
        to: "/workspaces/$workspaceId",
        params: { workspaceId: targetWorkspaceId },
        search: { noteId: undefined },
      });
    }
  }, [navigate, titleMap]);
  const authoring = useWorkspaceAuthoring({
    workspace,
    workspaceTitles: titleMap,
    focusNoteId,
    focusBlockId,
    focusSectionId,
    focusNonce,
    fullMode,
    onToggleFullMode: toggleCanvasFullMode,
    rightPanelOpen,
    onToggleRightPanel: handleToggleRightPanel,
    onRegisterNotePlacer: handleRegisterNotePlacer,
    onRegisterFocusHandlers: registerActiveCanvasFocusHandlers,
    onSelectNoteId: selectDockNote,
    onOpenInSideCards: handleOpenInSideCards,
    onOpenWorkspaceShortcut: handleOpenWorkspaceShortcut,
    onOutlineChange: setActiveCanvasOutlineItems,
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
      {!fullMode && <CanvasBreadcrumb workspace={workspace} currentTitle={authoring.currentWorkspaceTitle} />}
      {authoring.authoringVisible}
      <span className="sr-only" role="status" aria-label="Workspace save status"
        aria-live="polite" aria-atomic="true">{saveLabel}</span>
      {authoring.overlays}
    </div>
  );
}
