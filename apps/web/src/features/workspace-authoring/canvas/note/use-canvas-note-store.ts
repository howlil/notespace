import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { getNote } from "../../../../adapters/http/note-api";
import { createCanvasNoteStore, type CanvasNoteEntry, type CanvasNoteStore, type CanvasNoteStoreDeps, type CanvasNoteStoreSnapshot } from "./canvas-note-store";

const CanvasNoteStoreContext = createContext<CanvasNoteStore | null>(null);
export const CanvasNoteStoreProvider = CanvasNoteStoreContext.Provider;

/** One store per mounted Canvas: a Canvas re-reads its referenced Notes on entry (DEC6). */
export function useCanvasNoteStore(deps: Omit<CanvasNoteStoreDeps, "getNote">): CanvasNoteStore {
  const latest = useLatest(deps);
  const [store] = useState(() => createCanvasNoteStore({
    getNote,
    updateNote: (noteId, document, expectedRevision) => latest.current.updateNote(noteId, document, expectedRevision),
  }));
  // Leaving the Canvas must not drop a debounced draft; the session flush barrier normally ran already.
  useEffect(() => () => { void store.flushAll().catch(() => undefined); }, [store]);
  return store;
}

export function useCanvasNoteSnapshot(store: CanvasNoteStore): CanvasNoteStoreSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

const detachedSnapshot: CanvasNoteStoreSnapshot = { entries: {}, saves: {}, save: { state: "saved" } };
const detachedSubscribe = () => () => undefined;

/** Read-only lookup for embeds and references; shares the Canvas cache and its in-flight loads. */
export function useReferencedCanvasNote(noteId: string): CanvasNoteEntry {
  const store = useContext(CanvasNoteStoreContext);
  const snapshot = useSyncExternalStore(store?.subscribe ?? detachedSubscribe, store?.getSnapshot ?? (() => detachedSnapshot), store?.getSnapshot ?? (() => detachedSnapshot));
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
