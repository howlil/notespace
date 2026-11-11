import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useTheme } from "../../../shared/ui/theme/theme-provider";
import { useToast } from "../../../shared/ui/feedback/toast-provider";
import { useWorkspaceSession } from "./use-workspace-session";
import { normalizeWorkspaceContent } from "./workspace-content";
import { workspaceContentOf } from "../../../domain/workspace/workspace";
import type { Workspace } from "../../../domain/workspace/workspace";
import { registerDesktopFlush } from "../../../adapters/desktop/desktop-lifecycle";
import { subscribeWorkspaceConflict } from "../../../adapters/browser/workspace-conflict-events";
import { CanvasConflictRecovery } from "./CanvasConflictRecovery";
import { createNoteInstance, deleteNoteInstance, updateNote } from "../../../adapters/http/note-api";
import type { SaveStatus } from "../../../domain/workspace/autosave";
import type { NoteSaveStatus } from "../canvas/note/CanvasNoteCardLayer";

const CanvasEditor = lazy(() => import("../canvas/CanvasEditor"));


export function useWorkspaceAuthoring({ workspace, focusNoteId }: { workspace: Workspace; focusNoteId?: string }) {
  const { dark } = useTheme();
  const { showToast, dismissToast } = useToast();
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus>({ state: "saved" });
  const normalized = useMemo(() => normalizeWorkspaceContent(workspaceContentOf(workspace)), [workspace]);
  const session = useWorkspaceSession({
    workspaceId: workspace.id,
    canvasVersion: workspace.canvasVersion,
    initial: normalized.content,
  });
  const { current, canvasVersion, status: canvasStatus, dirty, flushAll, updateCanvas, acknowledgeCanvas, reconcileWorkspace, registerAuthoringFlush } = session;
  const registerCanvasAuthoringFlush = useCallback(
    (flush: () => Promise<void>) => registerAuthoringFlush("canvas-assets", flush),
    [registerAuthoringFlush],
  );
  const status = useMemo<SaveStatus>(() => noteSaveStatus.state === "conflict"
    ? { state: "conflict", message: noteSaveStatus.message ?? "Note save conflict. Your draft remains available for recovery." }
    : noteSaveStatus.state === "error"
      ? { state: "error", message: noteSaveStatus.message ?? "Could not save this Note." }
      : noteSaveStatus.state === "saving" ? { state: "saving" }
        : noteSaveStatus.state === "pending" ? { state: "pending" }
          : canvasStatus, [canvasStatus, noteSaveStatus]);
  const authoringDirty = dirty || noteSaveStatus.state !== "saved";

  const createCanvasNote = useCallback(async (request: Parameters<typeof createNoteInstance>[1]) => {
    const result = await createNoteInstance(workspace.id, { ...request, expectedCanvasVersion: canvasVersion });
    acknowledgeCanvas(result.canvas);
    return result;
  }, [acknowledgeCanvas, canvasVersion, workspace.id]);
  const deleteCanvasNote = useCallback(async (workspaceId: string, instanceId: string, canvas: Parameters<typeof deleteNoteInstance>[2], expectedCanvasVersion: number) => {
    const result = await deleteNoteInstance(workspaceId, instanceId, canvas, expectedCanvasVersion);
    acknowledgeCanvas(result);
    return result;
  }, [acknowledgeCanvas]);

  useEffect(() => subscribeWorkspaceConflict((draft) => {
    if (draft.workspaceId === workspace.id && draft.kind === "canvas") setRecoveryOpen(true);
  }), [workspace.id]);

  useEffect(() => {
    const result = reconcileWorkspace({
      workspaceId: workspace.id,
      canvasVersion: workspace.canvasVersion,
      content: normalized.content,
    });
    if (result === "remote-conflict") {
      showToast({
        id: `workspace-remote-update-${workspace.id}`,
        kind: "error",
        message: "This Workspace changed elsewhere. Your local Canvas draft stays open.",
        duration: Infinity,
      });
    }
  }, [normalized.content, reconcileWorkspace, showToast, workspace.canvasVersion, workspace.id]);

  const retrySave = useCallback(() => {
    const operation = noteSaveStatus.state === "conflict" && noteSaveStatus.recover
      ? noteSaveStatus.recover()
      : flushAll();
    void operation.catch((error: unknown) => {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Save failed. Try again." });
    });
  }, [flushAll, noteSaveStatus, showToast]);

  const prepareForDestructiveAction = useCallback(async () => {
    if (status.state === "conflict") {
      showToast({ kind: "error", message: noteSaveStatus.state === "conflict" ? "Recover the Note draft before deleting this Workspace." : "Resolve the Canvas conflict before deleting this Workspace." });
      return false;
    }
    try {
      await flushAll();
      return true;
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Changes could not be saved, so the Workspace was not deleted.",
        action: { label: "Retry save", onClick: retrySave, dismissOnClick: false },
      });
      return false;
    }
  }, [flushAll, noteSaveStatus.state, retrySave, showToast, status.state]);

  useEffect(() => {
    if (status.state === "error") {
      showToast({
        id: `workspace-save-${workspace.id}`,
        kind: "error",
        message: status.message ?? "Could not save changes.",
        action: { label: "Retry save", onClick: retrySave, dismissOnClick: false },
      });
    } else if (status.state === "conflict") {
      if (noteSaveStatus.state === "conflict") {
        showToast({
          id: `workspace-note-conflict-${workspace.id}`,
          kind: "error",
          message: status.message ?? "This Note changed elsewhere. Your draft is preserved.",
          duration: Infinity,
          action: { label: "Recover Note", onClick: retrySave, dismissOnClick: false },
        });
      } else {
        setRecoveryOpen(true);
        showToast({
          id: `workspace-conflict-${workspace.id}`,
          kind: "error",
          message: status.message ?? "Save conflict. Preserve your local draft before reloading.",
          duration: Infinity,
          action: { label: "Recover changes", onClick: () => setRecoveryOpen(true), dismissOnClick: false },
        });
      }
    } else if (status.state === "saved") {
      dismissToast(`workspace-conflict-${workspace.id}`);
      dismissToast(`workspace-note-conflict-${workspace.id}`);
      dismissToast(`workspace-save-${workspace.id}`);
    }
  }, [status, noteSaveStatus.state, retrySave, showToast, dismissToast, workspace.id]);

  useBlocker({
    shouldBlockFn: async () => {
      if (status.state === "conflict") return true;
      try {
        await flushAll();
        return false;
      } catch (error) {
        showToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Save failed. Please retry.",
          action: { label: "Retry save", onClick: retrySave, dismissOnClick: false },
        });
        return true;
      }
    },
    enableBeforeUnload: () => authoringDirty,
  });

  useEffect(() => registerDesktopFlush(flushAll), [flushAll]);
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushAll().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      void flushAll().catch(() => {});
    };
  }, [flushAll]);

  const authoringVisible = (
    <div className="relative h-full min-h-0 min-w-0 w-full overflow-hidden bg-canvas">
      <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted" role="status">Opening Canvas…</div>}>
        <CanvasEditor
          workspaceId={workspace.id}
          focusNoteId={focusNoteId}
          canvasVersion={canvasVersion}
          initial={current.current.canvas}
          onChange={updateCanvas}
          onCreateNote={createCanvasNote}
          onUpdateNote={updateNote}
          onDeleteNoteInstance={deleteCanvasNote}
          onNoteSaveState={setNoteSaveStatus}
          onRegisterAuthoringFlush={registerCanvasAuthoringFlush}
          onRegisterCanvasExport={session.registerCanvasExport}
          dark={dark}
        />
      </Suspense>
    </div>
  );

  return {
    authoringVisible,
    overlays: <CanvasConflictRecovery open={recoveryOpen} onOpenChange={setRecoveryOpen}
      onRetry={session.retryConflict} onUseSaved={session.useSavedCanvas}
      readExport={session.readCanvasExport} workspaceId={workspace.id} />,
    status,
    currentWorkspaceTitle: current.current.title,
    prepareForDestructiveAction,
  };
}
