import { BlockingAutosaveError } from "./autosave";
import { APIError } from "./http";
import { updateWorkspaceCanvas, updateWorkspaceNote } from "./api";
import type { Note, Snapshot } from "./project";

export class GranularConflictError extends BlockingAutosaveError {
  constructor(resource: "note" | "canvas") {
    super(`This ${resource} changed elsewhere. Autosave is paused so your local draft stays open for recovery.`);
    this.name = "GranularConflictError";
  }
}

export async function saveWorkspaceNote(
  workspaceId: string,
  noteId: string,
  value: Pick<Note, "title" | "document">,
  version: number,
) {
  try {
    return await updateWorkspaceNote(workspaceId, noteId, {
      title: value.title,
      document: value.document,
      version,
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 409) throw new GranularConflictError("note");
    throw error;
  }
}

export async function saveWorkspaceCanvas(
  workspaceId: string,
  canvas: Snapshot,
  version: number,
) {
  try {
    return await updateWorkspaceCanvas(workspaceId, canvas, version);
  } catch (error) {
    if (error instanceof APIError && error.status === 409) throw new GranularConflictError("canvas");
    throw error;
  }
}
