import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useTheme } from "../../../shared/ui/theme/theme-provider";
import { useToast } from "../../../shared/ui/feedback/toast-provider";
import { useWorkspaceSession } from "./use-workspace-session";
import { normalizeWorkspaceContent } from "../model/workspace-content";
import { workspaceContentOf, type Workspace } from "../../../entities/workspace";
import { registerDesktopFlush } from "../../../platform/runtime/durability-barrier";
import { CanvasConflictRecovery } from "./CanvasConflictRecovery";
import { createNoteInstance, deleteNote, deleteNoteInstance, updateNote } from "../../../platform/api/note-api";
import type { SaveStatus } from "../model/autosave";
import {
  useCanvasNoteSnapshot,
  useCanvasNoteStore,
} from "../../note-editor";

const CanvasEditor = lazy(() => import("../../canvas/core/CanvasEditor"));

export function useWorkspaceAuthoring({
  workspace,
  focusNoteId,
  focusBlockId,
  focusNonce,
  fullMode = false,
  onToggleFullMode,
  onRegisterNotePlacer,
}: {
  workspace: Workspace;
  focusNoteId?: string;
  focusBlockId?: string;
  focusNonce?: string;
  fullMode?: boolean;
  onToggleFullMode?: () => void;
  onRegisterNotePlacer?: (placer: (noteId: string) => Promise<void> | void) => (() => void) | void;
}) {
  const { dark, palette } = useTheme();
  const { showToast, dismissToast } = useToast();
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const noteStore = useCanvasNoteStore({ updateNote });
  const noteSaveStatus = useCanvasNoteSnapshot(noteStore).save;
  const normalized = useMemo(() => normalizeWorkspaceContent(workspaceContentOf(workspace)), [workspace]);
  const handleConflict = useCallback(() => {
    setRecoveryOpen(true);
  }, []);
  const session = useWorkspaceSession({
    workspaceId: workspace.id,
    canvasVersion: workspace.canvasVersion,
    initial: normalized.content,
    onConflict: handleConflict,
  });
  const {
    current,
    canvasVersion,
    getCanvasVersion,
    status: canvasStatus,
    dirty,
    flushAll,
    updateCanvas,
    acknowledgeCanvas,
    reconcileWorkspace,
    registerAuthoringFlush,
  } = session;

  useEffect(
    () => registerAuthoringFlush("notes", () => noteStore.flushAll()),
    [noteStore, registerAuthoringFlush],
  );

  const baselineVersionRef = useRef({ version: workspace.version, canvasVersion: workspace.canvasVersion });
  if (
    workspace.version > baselineVersionRef.current.version
    || workspace.canvasVersion > baselineVersionRef.current.canvasVersion
  ) {
    baselineVersionRef.current = { version: workspace.version, canvasVersion: workspace.canvasVersion };
  }
  const currentWorkspaceVersion = useCallback(() => {
    const base = baselineVersionRef.current;
    return base.version + Math.max(0, getCanvasVersion() - base.canvasVersion);
  }, [getCanvasVersion]);
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

  // Notes this session created. Leaving the workspace removes the ones left empty and unplaced.
  const createdNoteIds = useRef(new Set<string>());
  const flushOnLeave = useRef(flushAll);
  const createCanvasNote = useCallback(async (request: Parameters<typeof createNoteInstance>[1]) => {
    const result = await createNoteInstance(workspace.id, { ...request, expectedCanvasVersion: Math.max(request.expectedCanvasVersion, canvasVersion) });
    acknowledgeCanvas(result.canvas);
    if (!request.existingNoteId) createdNoteIds.current.add(result.note.id);
    return result;
  }, [acknowledgeCanvas, canvasVersion, workspace.id]);
  const deleteCanvasNote = useCallback(async (workspaceId: string, instanceId: string, canvas: Parameters<typeof deleteNoteInstance>[2], expectedCanvasVersion: number) => {
    const result = await deleteNoteInstance(workspaceId, instanceId, canvas, Math.max(expectedCanvasVersion, canvasVersion));
    acknowledgeCanvas(result);
    return result;
  }, [acknowledgeCanvas, canvasVersion]);

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

  const prepareForDestructiveAction = useCallback(async (): Promise<boolean | number> => {
    if (status.state === "conflict") {
      showToast({ kind: "error", message: noteSaveStatus.state === "conflict" ? "Recover the Note draft before deleting this Workspace." : "Resolve the Canvas conflict before deleting this Workspace." });
      return false;
    }
    try {
      await flushAll();
      return currentWorkspaceVersion();
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Changes could not be saved, so the Workspace was not deleted.",
        action: { label: "Retry save", onClick: retrySave, dismissOnClick: false },
      });
      return false;
    }
  }, [currentWorkspaceVersion, flushAll, noteSaveStatus.state, retrySave, showToast, status.state]);

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

  useEffect(() => { flushOnLeave.current = flushAll; }, [flushAll]);
  useEffect(() => {
    const created = createdNoteIds.current;
    return () => {
      // Runs only when the workspace is left, never on ordinary re-renders, so Redo
      // within the session still finds the Note. The server refuses any Note that is
      // non-empty or still placed, so this sweep never removes authored content.
      const noteIds = [...created];
      created.clear();
      void (async () => {
        try {
          await noteStore.flushAll();
        } catch {
          // A draft that failed to save may leave its Note looking empty on the server.
          // Keep it rather than deleting a Note whose latest text is not yet known to be saved.
          return;
        }
        await flushOnLeave.current().catch(() => undefined);
        await Promise.allSettled(noteIds.map((noteId) => deleteNote(noteId)));
      })();
    };
  }, [noteStore, workspace.id]);

  const authoringVisible = (
    <div className="relative h-full min-h-0 min-w-0 w-full overflow-hidden bg-canvas">
      <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted" role="status">Opening Canvas…</div>}>
        <CanvasEditor
          workspaceId={workspace.id}
          focusNoteId={focusNoteId}
          focusBlockId={focusBlockId}
          focusNonce={focusNonce}
          canvasVersion={canvasVersion}
          initial={current.current.canvas}
          noteStore={noteStore}
          fullMode={fullMode}
          onToggleFullMode={onToggleFullMode}
          onRegisterNotePlacer={onRegisterNotePlacer}
          onChange={updateCanvas}
          onCreateNote={createCanvasNote}
          onUpdateNote={updateNote}
          onDeleteNoteInstance={deleteCanvasNote}
          onRegisterAuthoringFlush={registerCanvasAuthoringFlush}
          onRegisterCanvasExport={session.registerCanvasExport}
          dark={dark}
          palette={palette}
        />
      </Suspense>
    </div>
  );

  return {
    authoringVisible,
    overlays: (
      <CanvasConflictRecovery
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        onRetry={session.retryConflict}
        onUseSaved={session.useSavedCanvas}
        readExport={session.readCanvasExport}
        workspaceId={workspace.id}
      />
    ),
    status,
    currentWorkspaceTitle: current.current.title,
    currentWorkspaceVersion: currentWorkspaceVersion(),
    prepareForDestructiveAction,
  };
}
