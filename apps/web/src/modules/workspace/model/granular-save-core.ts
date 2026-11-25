import { APIError } from "../../../platform/api/client.ts";
import { BlockingAutosaveError } from "./autosave.ts";
import { reconcileCanvasConflict } from "./canvas-conflict-retry.ts";
import type { GranularConflictDraft } from "./conflict.ts";
import type { Snapshot } from "../../../entities/workspace.ts";

type GranularCanvasState = {
  canvas: Snapshot;
  version: number;
  updatedAt: string;
};

export type GranularSaveDependencies = {
  getCanvas: (workspaceId: string) => Promise<GranularCanvasState>;
  updateCanvas: (
    workspaceId: string,
    canvas: Snapshot,
    version: number,
  ) => Promise<GranularCanvasState>;
  publishConflict: (draft: GranularConflictDraft) => void;
};

export class GranularConflictError extends BlockingAutosaveError {
  constructor(resource: "canvas") {
    super(`This ${resource} changed elsewhere. Autosave is paused so your local draft stays open for recovery.`);
    this.name = "GranularConflictError";
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
