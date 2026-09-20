import { useCallback, useRef, useState } from "react";
import type { Note, ProjectContent, Snapshot } from "../../domain/project/project";
import { useGranularWorkspaceAutosave } from "./use-granular-workspace-autosave";

export function useWorkspaceSession({
  workspaceId,
  canvasVersion,
  initial,
}: {
  workspaceId: string;
  canvasVersion: number;
  initial: ProjectContent;
}) {
  const current = useRef<ProjectContent>(initial);
  const [, setRevision] = useState(0);
  const snapshotFlushers = useRef(new Map<string, () => void>());
  const [unsnapshottedPanes, setUnsnapshottedPanes] = useState<Set<string>>(() => new Set());

  const touch = useCallback(() => setRevision((value) => value + 1), []);

  const onNoteSaved = useCallback((saved: Note) => {
    current.current = {
      ...current.current,
      // Save acknowledgements only advance optimistic versions. Local authored
      // fields remain authoritative because a newer edit may already exist.
      notes: current.current.notes.map((note) => note.id === saved.id ? { ...note, version: saved.version } : note),
    };
  }, []);

  const onCanvasSaved = useCallback(() => {
    // The Autosave instance owns Canvas version progression. Never replace the
    // current authored scene with an older acknowledgement snapshot.
  }, []);

  const autosave = useGranularWorkspaceAutosave({
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
    await autosave.flushAll();
  }, [autosave.flushAll]);

  const updateNoteDocument = useCallback((noteId: string, document: Snapshot) => {
    const existing = current.current.notes.find((note) => note.id === noteId);
    if (!existing) return;
    const next: Note = { ...existing, document, updatedAt: new Date().toISOString() };
    current.current = {
      ...current.current,
      document,
      notes: current.current.notes.map((note) => note.id === noteId ? next : note),
    };
    autosave.scheduleNote(next);
  }, [autosave.scheduleNote]);

  const updateCanvas = useCallback((canvas: Snapshot) => {
    current.current = { ...current.current, canvas };
    autosave.scheduleCanvas(canvas);
  }, [autosave.scheduleCanvas]);

  return {
    current,
    touch,
    status: autosave.status,
    dirty: autosave.dirty || unsnapshottedPanes.size > 0,
    scheduleNote: autosave.scheduleNote,
    flushNote: autosave.flushNote,
    forgetNote: autosave.forgetNote,
    flushAll,
    setPaneSnapshotDirty,
    registerPaneSnapshotFlush,
    updateNoteDocument,
    updateCanvas,
  };
}
