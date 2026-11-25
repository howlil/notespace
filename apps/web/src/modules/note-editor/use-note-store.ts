import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeLibraryChanges } from "../../platform/api/library-invalidation";
import { getNote, restoreTrashedNote, trashNote } from "../../platform/api/note-api";
import {
  createCanvasNoteStore,
  type CanvasNoteEntry,
  type CanvasNoteStore,
  type CanvasNoteStoreDeps,
  type CanvasNoteStoreSnapshot,
} from "./model/note-store";

const CanvasNoteStoreContext = createContext<CanvasNoteStore | null>(null);
export const CanvasNoteStoreProvider = CanvasNoteStoreContext.Provider;

/** One store per mounted workspace session: a Canvas re-reads its referenced Notes on entry. */
export function useCanvasNoteStore(deps: Omit<CanvasNoteStoreDeps, "getNote" | "trashNote" | "restoreNote">): CanvasNoteStore {
  const latest = useLatest(deps);
  const [store] = useState(() => createCanvasNoteStore({
    getNote,
    trashNote,
    restoreNote: restoreTrashedNote,
    updateNote: (noteId, document, expectedRevision) => latest.current.updateNote(noteId, document, expectedRevision),
  }));
  useEffect(() => {
    const unsubscribe = subscribeLibraryChanges(() => {
      for (const [noteId, entry] of Object.entries(store.getSnapshot().entries)) {
        if (entry.status === "trashed" || entry.status === "missing") {
          store.retry(noteId);
        }
      }
    });
    return () => { unsubscribe(); };
  }, [store]);
  return store;
}

export function useCanvasNoteSnapshot(store: CanvasNoteStore): CanvasNoteStoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

const detachedSnapshot: CanvasNoteStoreSnapshot = { entries: {}, saves: {}, save: { state: "saved" } };
const detachedSubscribe = () => () => undefined;

/** Read-only lookup for embeds and references; shares the active NoteStore cache and in-flight loads. */
export function useReferencedCanvasNote(noteId: string): CanvasNoteEntry {
  const store = useContext(CanvasNoteStoreContext);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? detachedSubscribe,
    store?.getSnapshot ?? (() => detachedSnapshot),
    store?.getSnapshot ?? (() => detachedSnapshot),
  );
  useEffect(() => {
    if (store && noteId) store.ensure([noteId]);
  }, [store, noteId]);
  if (!noteId) return { status: "missing" };
  if (!store) return { status: "failed", message: "Note references are unavailable here." };
  return snapshot.entries[noteId] ?? { status: "loading" };
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => { ref.current = value; });
  return ref;
}
