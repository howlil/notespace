import {
  getWorkspaceCanvas,
  updateWorkspaceCanvas,
} from "../../../adapters/http/workspace-api";
import { publishGranularConflict } from "../../../adapters/browser/workspace-conflict-events";
import type { Snapshot } from "../../../domain/workspace/workspace";
import {
  saveWorkspaceCanvasWith,
  type GranularSaveDependencies,
} from "./granular-save-core";

export { GranularConflictError } from "./granular-save-core";

const defaultGranularSaveDependencies: GranularSaveDependencies = {
  getCanvas: getWorkspaceCanvas,
  updateCanvas: updateWorkspaceCanvas,
  publishConflict: publishGranularConflict,
};

export function saveWorkspaceCanvas(
  workspaceId: string,
  canvas: Snapshot,
  version: number,
) {
  return saveWorkspaceCanvasWith(
    defaultGranularSaveDependencies,
    workspaceId,
    canvas,
    version,
  );
}
