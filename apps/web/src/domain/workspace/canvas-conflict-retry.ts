import { mergeCanvasSnapshots } from "./canvas-merge.ts";
import type { Snapshot } from "./workspace";

export type CanvasConflictLatest = {
  canvas: Snapshot;
  canvasVersion: number;
};

export type CanvasConflictResolution = {
  canvas: Snapshot;
  version: number;
  converged: boolean;
};

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reconcileCanvasConflict(
  local: Snapshot,
  latest: CanvasConflictLatest,
): CanvasConflictResolution {
  const canvas = mergeCanvasSnapshots(local, latest.canvas);
  return {
    canvas,
    version: latest.canvasVersion,
    converged: sameSnapshot(canvas, latest.canvas),
  };
}
