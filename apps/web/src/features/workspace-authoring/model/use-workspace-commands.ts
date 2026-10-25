import { useCallback, useRef, type MutableRefObject } from "react";
import type { Note, WorkspaceContent } from "../../../domain/workspace/workspace";
import {
  createWorkspaceNote,
  deleteWorkspaceNote,
  getWorkspaceNote,
  APIError,
  renameWorkspace as renameWorkspaceRequest,
} from "../../../adapters/http/workspace-api";
import { useToast } from "../../../shared/ui/toast-provider";
import { errorMessage } from "../../../shared/lib/error-message";
import { blankDocument } from "./workspace-content";

type WorkspaceCommandSession = {
  current: MutableRefObject<WorkspaceContent>;
  touchContent: () => void;
  scheduleNote: (note: Note) => void;
  flushNote: (noteId: string) => Promise<void>;
  forgetNote: (noteId: string) => void;
};

export function useWorkspaceCommands({
  workspaceId,
  current,
  touchContent,
  scheduleNote,
  flushNote,
  forgetNote,
}: WorkspaceCommandSession & { workspaceId: string }) {
  const { showToast } = useToast();
  const pendingCreate = useRef<{ id: string; title: string; document: ReturnType<typeof blankDocument> } | null>(null);

  const createNote = useCallback(async () => {
    // Keep the same client ID across an ambiguous response and a user retry.
    const draft = pendingCreate.current ?? {
      id: crypto.randomUUID(), title: "Untitled", document: blankDocument(),
    };
    pendingCreate.current = draft;
    let note: Note;
    try {
      note = await createWorkspaceNote(workspaceId, draft);
    } catch (error) {
      try {
        const persisted = await getWorkspaceNote(workspaceId, draft.id);
        if (persisted.title !== draft.title
          || JSON.stringify(persisted.document) !== JSON.stringify(draft.document)) {
          throw new Error("An existing Note has a different document.");
        }
        note = persisted;
      } catch (readError) {
        // Definitive 404 means the create did not commit. Unknown read results
        // retain the ID so Retry cannot accidentally create a duplicate.
        if (readError instanceof APIError && readError.status === 404) pendingCreate.current = null;
        showToast({ kind: "error", message: readError instanceof APIError && readError.status !== 404
          ? "Note creation cannot be confirmed. Retry uses the same Note ID."
          : error instanceof Error ? error.message : "Could not create note." });
        return null;
      }
    }
    pendingCreate.current = null;
    if (!current.current.notes.some((existing) => existing.id === note.id)) {
      const notes = [...current.current.notes, note];
      current.current = { ...current.current, notes, document: notes[0]?.document ?? note.document };
      touchContent();
    }
    return note;
  }, [current, showToast, touchContent, workspaceId]);

  const renameWorkspace = useCallback(async (title: string) => {
    try {
      const renamed = await renameWorkspaceRequest(workspaceId, title, current.current.title);
      current.current = {
        ...current.current,
        title: renamed.title,
      };
      touchContent();
      showToast({ kind: "success", message: "Workspace renamed." });
      return renamed.title;
    } catch (error) {
      showToast({
        kind: "error",
        message: errorMessage(error, "Could not rename workspace."),
      });
      return null;
    }
  }, [current, showToast, touchContent, workspaceId]);

  const renameNote = useCallback((noteId: string, title: string) => {
    const existing = current.current.notes.find((note) => note.id === noteId);
    if (!existing) return false;
    const nextNote: Note = {
      ...existing,
      title,
      updatedAt: new Date().toISOString(),
    };
    current.current = {
      ...current.current,
      notes: current.current.notes.map((note) => note.id === noteId ? nextNote : note),
    };
    touchContent();
    scheduleNote(nextNote);
    return true;
  }, [current, scheduleNote, touchContent]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (current.current.notes.length <= 1) return null;
    try {
      await flushNote(noteId);
      const persisted = current.current.notes.find((note) => note.id === noteId);
      if (!persisted) return null;
      try {
        await deleteWorkspaceNote(workspaceId, persisted.id, persisted.version);
      } catch (error) {
        try {
          await getWorkspaceNote(workspaceId, persisted.id);
          throw error; // A present Note means deletion was not confirmed.
        } catch (readError) {
          if (!(readError instanceof APIError && readError.status === 404)) throw error;
        }
      }
      const notes = current.current.notes.filter((note) => note.id !== persisted.id);
      const replacement = notes[0];
      current.current = {
        ...current.current,
        notes,
        document: replacement.document,
      };
      forgetNote(persisted.id);
      touchContent();
      return {
        deletedId: persisted.id,
        replacementId: replacement.id,
      };
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not delete note.",
      });
      return null;
    }
  }, [current, flushNote, forgetNote, showToast, touchContent, workspaceId]);

  return {
    createNote,
    renameWorkspace,
    renameNote,
    deleteNote,
  };
}
