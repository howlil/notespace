import {
  getWorkspaceCanvas,
  updateWorkspaceCanvas,
} from "../../../platform/api/workspace-api";
import type { GranularConflictDraft } from "../model/conflict";
import type { Snapshot } from "../../../entities/workspace";
import {
  saveWorkspaceCanvasWith,
  type GranularSaveDependencies,
} from "../model/granular-save-core";

export { GranularConflictError } from "../model/granular-save-core";

export function saveWorkspaceCanvas(
  workspaceId: string,
  canvas: Snapshot,
  version: number,
  onConflict?: (draft: GranularConflictDraft) => void,
) {
  const deps: GranularSaveDependencies = {
    getCanvas: getWorkspaceCanvas,
    updateCanvas: updateWorkspaceCanvas,
    publishConflict: onConflict ?? (() => {}),
  };
  return saveWorkspaceCanvasWith(
    deps,
    workspaceId,
    canvas,
    version,
  );
}
