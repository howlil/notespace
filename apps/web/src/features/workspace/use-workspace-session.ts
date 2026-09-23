import { useCallback, useRef, useState } from "react";
import type { Note, WorkspaceContent, Snapshot } from "../../domain/workspace/workspace";
import { acknowledgeNoteVersion, applyCanvasSnapshot, applyNoteDocument } from "./workspace-session-state";
import { useGranularWorkspaceAutosave } from "./use-granular-workspace-autosave";

export function useWorkspaceSession({
  workspaceId,
  canvasVersion,
  initial,
}: {
  workspaceId: string;
  canvasVersion: number;
  initial: WorkspaceContent;
}) {
  const current = useRef<WorkspaceContent>(initial);
  const [, setRevision] = useState(0);
  const snapshotFlushers = useRef(new Map<string, () => void>());
  const [unsnapshottedPanes, setUnsnapshottedPanes] = useState<Set<string>>(() => new Set());

  const touch = useCallback(() => setRevision((value) => value + 1), []);

  const onNoteSaved = useCallback((saved: Note) => {
    current.current = acknowledgeNoteVersion(current.current, saved);
  }, []);

  const onCanvasSaved = useCallback(() => {
    // The Autosave instance owns Canvas version progression. Never replace the
    // current authored scene with an older acknowledgement snapshot.
  }, []);

  const {
    status,
    dirty: granularDirty,
    scheduleNote,
    scheduleCanvas,
    flushAll: flushGranular,
    flushNote,
    forgetNote,
  } = useGranularWorkspaceAutosave({
    workspaceId,
    canvasVersion,
    onNoteSaved,
    onCanvasSaved,
  });

  const setPaneSnapshotDirty = useCallback((paneId: string, dirty: boolean) => {
    setUnsnapshottedPanes((existing) => {
      if (existing.has(paneId) === dirty) return existing;
      const next = new Set(existing);
      if (dirty) next.add(paneId);
      else next.delete(paneId);
      return next;
    });
  }, []);

  const registerPaneSnapshotFlush = useCallback((paneId: string, flush: (() => void) | null) => {
    if (flush) snapshotFlushers.current.set(paneId, flush);
    else snapshotFlushers.current.delete(paneId);
  }, []);

  const flushAll = useCallback(async () => {
    for (const flushSnapshot of snapshotFlushers.current.values()) flushSnapshot();
    await flushGranular();
  }, [flushGranular]);

  const updateNoteDocument = useCallback((noteId: string, document: Snapshot) => {
    const transition = applyNoteDocument(current.current, noteId, document, new Date().toISOString());
    if (!transition) return;
    current.current = transition.content;
    scheduleNote(transition.note);
  }, [scheduleNote]);

  const updateCanvas = useCallback((canvas: Snapshot) => {
    current.current = applyCanvasSnapshot(current.current, canvas);
    scheduleCanvas(canvas);
  }, [scheduleCanvas]);

  return {
    current,
    touch,
    status,
    dirty: granularDirty || unsnapshottedPanes.size > 0,
    scheduleNote,
    flushNote,
    forgetNote,
    flushAll,
    setPaneSnapshotDirty,
    registerPaneSnapshotFlush,
    updateNoteDocument,
    updateCanvas,
  };
}
