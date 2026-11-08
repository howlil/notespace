import type { WorkspaceContent, Snapshot } from "../../../domain/workspace/workspace";
import { mergeCanvasSnapshots } from "../../../domain/workspace/canvas-merge.ts";

export function applyCanvasSnapshot(content: WorkspaceContent, canvas: Snapshot): WorkspaceContent {
  return { ...content, canvas };
}

export function acknowledgeCanvasSnapshot(content: WorkspaceContent, saved: Snapshot): WorkspaceContent {
  return applyCanvasSnapshot(content, mergeCanvasSnapshots(content.canvas, saved));
}
