import {
  getWorkspaceCanvas,
  updateWorkspaceCanvas,
  updateWorkspaceNote,
} from "../../../adapters/http/workspace-api";
import { publishGranularConflict } from "../../../adapters/browser/workspace-conflict-events";
import type { Note, Snapshot } from "../../../domain/workspace/workspace";
import {
  saveWorkspaceCanvasWith,
  saveWorkspaceNoteWith,
  type GranularSaveDependencies,
} from "./granular-save-core";

export { GranularConflictError } from "./granular-save-core";

const defaultGranularSaveDependencies: GranularSaveDependencies = {
  updateNote: updateWorkspaceNote,
  getCanvas: getWorkspaceCanvas,
  updateCanvas: updateWorkspaceCanvas,
  publishConflict: publishGranularConflict,
};

export function saveWorkspaceNote(
  workspaceId: string,
  noteId: string,
  value: Pick<Note, "title" | "document">,
  version: number,
) {
  return saveWorkspaceNoteWith(
    defaultGranularSaveDependencies,
    workspaceId,
    noteId,
    value,
    version,
  );
}

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
