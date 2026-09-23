import { useCallback, type MutableRefObject } from "react";
import type { Note, WorkspaceContent } from "../../../domain/workspace/workspace";
import {
  createWorkspaceNote,
  deleteWorkspaceNote,
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

  const createNote = useCallback(async () => {
    const id = crypto.randomUUID();
    const document = blankDocument();
    try {
      const note = await createWorkspaceNote(workspaceId, {
        id,
        title: "Untitled",
        document,
      });
      current.current = {
        ...current.current,
        notes: [...current.current.notes, note],
        document: note.document,
      };
      touchContent();
      return note;
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not create note.",
      });
      return null;
    }
  }, [current, showToast, touchContent, workspaceId]);

  const renameWorkspace = useCallback(async (title: string) => {
    try {
      const renamed = await renameWorkspaceRequest(workspaceId, title);
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
      await deleteWorkspaceNote(workspaceId, persisted.id, persisted.version);
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
