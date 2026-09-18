import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Autosave } from "../../domain/project/autosave";
import type { SaveStatus } from "../../domain/project/autosave";
import { saveWorkspaceCanvas, saveWorkspaceNote } from "../../domain/project/granular-save";
import type { CanvasState, } from "../../domain/project/api";
import type { Note, Snapshot } from "../../domain/project/project";

type NoteDraft = Pick<Note, "title" | "document">;

const savedStatus: SaveStatus = { state: "saved" };

function statusPriority(status: SaveStatus) {
  if (status.state === "conflict") return 5;
  if (status.state === "error") return 4;
  if (status.state === "saving") return 3;
  if (status.state === "pending") return 2;
  return 1;
}

export function combineSaveStatuses(...statuses: SaveStatus[]) {
  return statuses.reduce((current, candidate) =>
    statusPriority(candidate) > statusPriority(current) ? candidate : current,
  savedStatus);
}

export function useGranularWorkspaceAutosave({
  workspaceId,
  canvasVersion,
  onNoteSaved,
  onCanvasSaved,
}: {
  workspaceId: string;
  canvasVersion: number;
  onNoteSaved: (note: Note) => void;
  onCanvasSaved: (state: CanvasState) => void;
}) {
  const callbacks = useRef({ onNoteSaved, onCanvasSaved });
  callbacks.current = { onNoteSaved, onCanvasSaved };

  const noteSavers = useRef(new Map<string, Autosave<NoteDraft>>());
  const noteUnsubscribers = useRef(new Map<string, () => void>());
  const [noteStatuses, setNoteStatuses] = useState<Record<string, SaveStatus>>({});
  const [canvasStatus, setCanvasStatus] = useState<SaveStatus>(savedStatus);

  const [canvasSaver] = useState(() => new Autosave<Snapshot>(
    Math.max(1, canvasVersion),
    async (canvas, version) => {
      const saved = await saveWorkspaceCanvas(workspaceId, canvas, version);
      callbacks.current.onCanvasSaved(saved);
      return saved;
    },
  ));

  useEffect(() => canvasSaver.subscribe(setCanvasStatus), [canvasSaver]);

  const noteSaver = useCallback((note: Note) => {
    const existing = noteSavers.current.get(note.id);
    if (existing) return existing;

    const saver = new Autosave<NoteDraft>(
      Math.max(1, note.version),
      async (draft, version) => {
        const saved = await saveWorkspaceNote(workspaceId, note.id, draft, version);
        callbacks.current.onNoteSaved(saved);
        return saved;
      },
    );
    const unsubscribe = saver.subscribe((status) => {
      setNoteStatuses((current) => current[note.id] === status ? current : { ...current, [note.id]: status });
    });
    noteSavers.current.set(note.id, saver);
    noteUnsubscribers.current.set(note.id, unsubscribe);
    return saver;
  }, [workspaceId]);

  const scheduleNote = useCallback((note: Note) => {
    noteSaver(note).schedule({ title: note.title, document: note.document });
  }, [noteSaver]);

  const scheduleCanvas = useCallback((canvas: Snapshot) => {
    canvasSaver.schedule(canvas);
  }, [canvasSaver]);

  const flushNote = useCallback(async (noteId: string) => {
    await noteSavers.current.get(noteId)?.flush();
  }, []);

  const forgetNote = useCallback((noteId: string) => {
    noteUnsubscribers.current.get(noteId)?.();
    noteUnsubscribers.current.delete(noteId);
    noteSavers.current.delete(noteId);
    setNoteStatuses((current) => {
      if (!(noteId in current)) return current;
      const next = { ...current };
      delete next[noteId];
      return next;
    });
  }, []);

  const flushAll = useCallback(async () => {
    await Promise.all([
      canvasSaver.flush(),
      ...[...noteSavers.current.values()].map((saver) => saver.flush()),
    ]);
  }, [canvasSaver]);

  const dirty = canvasSaver.dirty || [...noteSavers.current.values()].some((saver) => saver.dirty);
  const status = useMemo(
    () => combineSaveStatuses(canvasStatus, ...Object.values(noteStatuses)),
    [canvasStatus, noteStatuses],
  );

  useEffect(() => () => {
    for (const unsubscribe of noteUnsubscribers.current.values()) unsubscribe();
    void canvasSaver.flush().catch(() => {});
    for (const saver of noteSavers.current.values()) void saver.flush().catch(() => {});
  }, [canvasSaver]);

  return {
    status,
    dirty,
    scheduleNote,
    scheduleCanvas,
    flushAll,
    flushNote,
    forgetNote,
  };
}
