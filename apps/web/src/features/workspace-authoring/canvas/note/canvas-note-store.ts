import type { Note } from "../../../../adapters/http/note-api";
import type { NoteDocument } from "../../../../domain/note/note";

export type NoteSaveState = "saved" | "pending" | "saving" | "error" | "conflict";
export type NoteSaveStatus = { state: NoteSaveState; message?: string; recover?: () => Promise<void> };

export type CanvasNoteEntry =
  | { status: "loading" }
  | { status: "ready"; note: Note }
  | { status: "missing" }
  | { status: "failed"; message: string };

export type CanvasNoteStoreSnapshot = {
  entries: Readonly<Record<string, CanvasNoteEntry>>;
  /** Per-Note save state; Notes that are saved are absent. */
  saves: Readonly<Record<string, NoteSaveState>>;
  save: NoteSaveStatus;
};

export type CanvasNoteStoreDeps = {
  getNote: (noteId: string) => Promise<Note>;
  updateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  debounceMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type CanvasNoteStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => CanvasNoteStoreSnapshot;
  /** Loads every id that has no entry yet; missing/failed entries wait for an explicit retry. */
  ensure: (noteIds: Iterable<string>) => void;
  retry: (noteId: string) => void;
  queue: (noteId: string, document: NoteDocument) => void;
  flush: (noteId: string) => Promise<void>;
  flushAll: () => Promise<void>;
};

type PendingSave = { document?: NoteDocument; revision: number; timer?: unknown; inFlight?: Promise<void> };

const savePriority: NoteSaveState[] = ["conflict", "error", "saving", "pending"];

export function aggregateSaveStatus(statuses: Iterable<NoteSaveStatus>): NoteSaveStatus {
  const all = [...statuses];
  for (const state of savePriority) {
    const match = all.find((status) => status.state === state);
    if (match) return match;
  }
  return { state: "saved" };
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function createCanvasNoteStore(deps: CanvasNoteStoreDeps): CanvasNoteStore {
  const debounceMs = deps.debounceMs ?? 350;
  const setTimer = deps.setTimer ?? ((callback: () => void, ms: number) => globalThis.setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  const listeners = new Set<() => void>();
  const loads = new Map<string, Promise<void>>();
  const pending = new Map<string, PendingSave>();
  const saveStates = new Map<string, NoteSaveStatus>();
  let entries: Record<string, CanvasNoteEntry> = {};
  let snapshot: CanvasNoteStoreSnapshot = { entries, saves: {}, save: { state: "saved" } };

  const publish = () => {
    const next = aggregateSaveStatus(saveStates.values());
    const previous = snapshot.save;
    const save = next.state === previous.state && next.message === previous.message && next.recover === previous.recover ? previous : next;
    const saves = Object.fromEntries([...saveStates].map(([noteId, status]) => [noteId, status.state]));
    snapshot = { entries, saves, save };
    for (const listener of listeners) listener();
  };
  const setEntry = (noteId: string, entry: CanvasNoteEntry) => {
    entries = { ...entries, [noteId]: entry };
  };
  const reportSave = (noteId: string, status: NoteSaveStatus) => {
    if (status.state === "saved") saveStates.delete(noteId);
    else saveStates.set(noteId, status);
  };
  const reportFailure = (noteId: string, error: unknown, fallback: string) => {
    const conflict = errorStatus(error) === 409;
    // Conflicts rebase on the latest revision; other failures resend the retained draft as-is.
    reportSave(noteId, {
      state: conflict ? "conflict" : "error",
      message: errorMessage(error, fallback),
      recover: conflict ? () => recover(noteId) : () => flush(noteId),
    });
    publish();
  };
  // A newer local draft stays authoritative over an older acknowledgement so the editor never rewinds.
  const acknowledge = (noteId: string, saved: Note, newerDraft: NoteDocument | undefined) => {
    setEntry(noteId, { status: "ready", note: newerDraft ? { ...saved, document: newerDraft } : saved });
    publish();
  };

  const load = (noteId: string) => {
    setEntry(noteId, { status: "loading" });
    publish();
    const request = deps.getNote(noteId).then((note) => {
      setEntry(noteId, { status: "ready", note });
    }, (error: unknown) => {
      setEntry(noteId, errorStatus(error) === 404
        ? { status: "missing" }
        : { status: "failed", message: errorMessage(error, "Could not load this Note.") });
    }).finally(() => {
      loads.delete(noteId);
      publish();
    });
    loads.set(noteId, request);
  };

  const flush = (noteId: string): Promise<void> => {
    const entry = pending.get(noteId);
    if (!entry) return Promise.resolve();
    if (entry.timer !== undefined) {
      clearTimer(entry.timer);
      entry.timer = undefined;
    }
    if (entry.inFlight) return entry.inFlight;
    const run = async () => {
      reportSave(noteId, { state: "saving" });
      publish();
      while (entry.document) {
        const document = entry.document;
        entry.document = undefined;
        try {
          const saved = await deps.updateNote(noteId, document, entry.revision);
          entry.revision = saved.revision;
          acknowledge(noteId, saved, entry.document);
        } catch (error) {
          entry.document ??= document;
          throw error;
        }
      }
      pending.delete(noteId);
      reportSave(noteId, { state: "saved" });
      publish();
    };
    entry.inFlight = run().catch((error: unknown) => {
      reportFailure(noteId, error, "Could not save this Note.");
      throw error;
    }).finally(() => {
      entry.inFlight = undefined;
    });
    return entry.inFlight;
  };

  async function recover(noteId: string): Promise<void> {
    const entry = pending.get(noteId);
    const document = entry?.document;
    if (!entry || !document) return;
    reportSave(noteId, { state: "saving" });
    publish();
    try {
      const latest = await deps.getNote(noteId);
      const saved = await deps.updateNote(noteId, document, latest.revision);
      entry.revision = saved.revision;
      if (entry.document === document) entry.document = undefined;
      acknowledge(noteId, saved, entry.document);
    } catch (error) {
      reportFailure(noteId, error, "Could not recover this Note.");
      throw error;
    }
    if (entry.document) return flush(noteId);
    pending.delete(noteId);
    reportSave(noteId, { state: "saved" });
    publish();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    ensure(noteIds) {
      for (const noteId of new Set(noteIds)) {
        if (noteId && !entries[noteId] && !loads.has(noteId)) load(noteId);
      }
    },
    retry(noteId) {
      const entry = entries[noteId];
      if (entry?.status === "missing" || entry?.status === "failed") load(noteId);
    },
    queue(noteId, document) {
      const current = entries[noteId];
      if (current?.status !== "ready") return;
      const entry = pending.get(noteId) ?? { revision: current.note.revision };
      entry.document = document;
      if (entry.timer !== undefined) clearTimer(entry.timer);
      entry.timer = setTimer(() => {
        entry.timer = undefined;
        // Failures are already visible as this Note's save state and retry; never a second toast.
        void flush(noteId).catch(() => undefined);
      }, debounceMs);
      pending.set(noteId, entry);
      setEntry(noteId, { status: "ready", note: { ...current.note, document } });
      reportSave(noteId, { state: "pending" });
      publish();
    },
    flush,
    async flushAll() {
      await Promise.all([...pending.keys()].map((noteId) => flush(noteId)));
    },
  };
}
