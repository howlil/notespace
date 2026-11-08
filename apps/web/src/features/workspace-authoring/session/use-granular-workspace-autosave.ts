import { useCallback, useEffect, useState } from "react";
import { Autosave } from "../../../domain/workspace/autosave";
import type { SaveStatus } from "../../../domain/workspace/autosave";
import { saveWorkspaceCanvas } from "./granular-save";
import type { CanvasState } from "../../../adapters/http/workspace-api";
import type { Snapshot } from "../../../domain/workspace/workspace";

const savedStatus: SaveStatus = { state: "saved" };

export function useGranularWorkspaceAutosave({
  workspaceId,
  canvasVersion,
  onCanvasSaved,
  beforePersist,
}: {
  workspaceId: string;
  canvasVersion: number;
  onCanvasSaved: (state: CanvasState) => Snapshot;
  beforePersist?: () => Promise<void>;
}) {
  const [canvasStatus, setCanvasStatus] = useState<SaveStatus>(savedStatus);

  const [canvasSaver] = useState(() => new Autosave<Snapshot>(
    Math.max(1, canvasVersion),
    async (canvas, version) => {
      await beforePersist?.();
      const saved = await saveWorkspaceCanvas(workspaceId, canvas, version);
      canvasSaver.replacePending(onCanvasSaved(saved));
      return saved;
    },
  ));

  useEffect(() => canvasSaver.subscribe(setCanvasStatus), [canvasSaver]);

  const scheduleCanvas = useCallback((canvas: Snapshot) => {
    canvasSaver.schedule(canvas);
  }, [canvasSaver]);

  const flushAll = useCallback(async () => {
    await canvasSaver.flush();
  }, [canvasSaver]);

  const rebaseVersion = useCallback((version: number) => canvasSaver.rebase(version), [canvasSaver]);

  const recoverCanvas = useCallback(async (version: number, canvas?: Snapshot) => {
    if (!canvasSaver.recover(version, canvas)) throw new Error("Wait for the current save to finish, then try again.");
    if (canvas) await canvasSaver.flush();
  }, [canvasSaver]);

  const dirty = canvasSaver.dirty;

  useEffect(() => () => {
    void canvasSaver.flush().catch(() => {});
  }, [canvasSaver]);

  return {
    status: canvasStatus,
    dirty,
    scheduleCanvas,
    flushAll,
    rebaseVersion,
    recoverCanvas,
  };
}
