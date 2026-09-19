import { BlockingAutosaveError } from "./autosave";
import { reconcileCanvasConflict } from "./canvas-conflict-retry";
import { publishGranularConflict } from "./conflict-recovery";
import { APIError, getProject } from "./http";
import { updateWorkspaceCanvas, updateWorkspaceNote } from "./api";
import type { Note, Project, Snapshot } from "./project";

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
    if (error instanceof APIError && error.status === 409) {
      publishGranularConflict({
        kind: "note",
        workspaceId,
        noteId,
        local: { ...value, version },
      });
      throw new GranularConflictError("note");
    }
    throw error;
  }
}


export async function saveWorkspaceCanvas(
  workspaceId: string,
  canvas: Snapshot,
  version: number,
) {
  let candidate = canvas;
  let candidateVersion = version;
  let latest: Project | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await updateWorkspaceCanvas(workspaceId, candidate, candidateVersion);
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 409) throw error;

      latest = await getProject(workspaceId);
      const resolution = reconcileCanvasConflict(candidate, latest);
      candidate = resolution.canvas;
      candidateVersion = resolution.version;

      // Another tab may already have converged to exactly the same authored
      // scene. Treat that state as the acknowledgement instead of generating
      // an unnecessary version bump.
      if (resolution.converged) {
        return {
          canvas: latest.canvas,
          version: latest.canvasVersion,
          updatedAt: latest.updatedAt,
        };
      }
    }
  }

  publishGranularConflict({
    kind: "canvas",
    workspaceId,
    local: candidate,
    latest: latest?.canvas,
    latestVersion: latest?.canvasVersion,
  });
  throw new GranularConflictError("canvas");
}
