import { APIError } from "../../../adapters/http/client.ts";
import { BlockingAutosaveError } from "../../../domain/workspace/autosave.ts";
import { reconcileCanvasConflict } from "../../../domain/workspace/canvas-conflict-retry.ts";
import type { GranularConflictDraft } from "../../../domain/workspace/conflict.ts";
import type { Note, Snapshot } from "../../../domain/workspace/workspace.ts";

export type GranularCanvasState = {
  canvas: Snapshot;
  version: number;
  updatedAt: string;
};

export type GranularSaveDependencies = {
  updateNote: (
    workspaceId: string,
    noteId: string,
    input: { title: string; document: Snapshot; version: number },
  ) => Promise<Note>;
  getCanvas: (workspaceId: string) => Promise<GranularCanvasState>;
  updateCanvas: (
    workspaceId: string,
    canvas: Snapshot,
    version: number,
  ) => Promise<GranularCanvasState>;
  publishConflict: (draft: GranularConflictDraft) => void;
};

export class GranularConflictError extends BlockingAutosaveError {
  constructor(resource: "note" | "canvas") {
    super(`This ${resource} changed elsewhere. Autosave is paused so your local draft stays open for recovery.`);
    this.name = "GranularConflictError";
  }
}

export async function saveWorkspaceNoteWith(
  deps: GranularSaveDependencies,
  workspaceId: string,
  noteId: string,
  value: Pick<Note, "title" | "document">,
  version: number,
) {
  try {
    return await deps.updateNote(workspaceId, noteId, {
      title: value.title,
      document: value.document,
      version,
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 409) {
      deps.publishConflict({
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

export async function saveWorkspaceCanvasWith(
  deps: GranularSaveDependencies,
  workspaceId: string,
  canvas: Snapshot,
  version: number,
) {
  let candidate = canvas;
  let candidateVersion = version;
  let latest: GranularCanvasState | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await deps.updateCanvas(workspaceId, candidate, candidateVersion);
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 409) throw error;

      latest = await deps.getCanvas(workspaceId);
      const resolution = reconcileCanvasConflict(candidate, {
        canvas: latest.canvas,
        canvasVersion: latest.version,
      });
      candidate = resolution.canvas;
      candidateVersion = resolution.version;

      if (resolution.converged) {
        return {
          canvas: latest.canvas,
          version: latest.version,
          updatedAt: latest.updatedAt,
        };
      }
    }
  }

  deps.publishConflict({
    kind: "canvas",
    workspaceId,
    local: candidate,
    latest: latest?.canvas,
    latestVersion: latest?.version,
  });
  throw new GranularConflictError("canvas");
}
