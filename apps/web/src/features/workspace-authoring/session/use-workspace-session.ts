import { useCallback, useRef, useState } from "react";
import type { WorkspaceContent, Snapshot } from "../../../domain/workspace/workspace";
import { acknowledgeCanvasSnapshot, applyCanvasSnapshot } from "./workspace-session-state";
import { useGranularWorkspaceAutosave } from "./use-granular-workspace-autosave";
import { getWorkspaceCanvas, type CanvasState } from "../../../adapters/http/workspace-api";

export function useWorkspaceSession({
  workspaceId,
  canvasVersion,
  initial,
}: {
  workspaceId: string;
  canvasVersion: number;
  initial: WorkspaceContent;
}) {
  const current = useRef<WorkspaceContent>(initial);
  const [, setRevision] = useState(0);
  const identity = useRef({ workspaceId, canvasVersion });
  const authoringFlushers = useRef(new Map<string, () => Promise<void>>());
  const canvasExport = useRef<(() => string) | null>(null);

  const touch = useCallback(() => setRevision((value) => value + 1), []);

  const registerCanvasExport = useCallback((read: () => string) => {
    canvasExport.current = read;
    return () => { if (canvasExport.current === read) canvasExport.current = null; };
  }, []);
  const readCanvasExport = useCallback(() => {
    if (!canvasExport.current) throw new Error("The Canvas is still opening. Try again shortly.");
    return canvasExport.current();
  }, []);

  const registerAuthoringFlush = useCallback((key: string, flush: (() => Promise<void>) | null) => {
    if (flush) authoringFlushers.current.set(key, flush);
    else authoringFlushers.current.delete(key);
    return () => {
      if (flush && authoringFlushers.current.get(key) === flush) authoringFlushers.current.delete(key);
    };
  }, []);

  const flushRegisteredAuthoring = useCallback(async () => {
    for (const flush of authoringFlushers.current.values()) await flush();
  }, []);

  const onCanvasSaved = useCallback((saved: CanvasState) => {
    const next = acknowledgeCanvasSnapshot(current.current, saved.canvas);
    if (JSON.stringify(next.canvas) !== JSON.stringify(current.current.canvas)) {
      current.current = next;
      touch();
    }
    return current.current.canvas;
  }, [touch]);

  const {
    status,
    dirty: granularDirty,
    scheduleCanvas,
    flushAll: flushGranular,
    rebaseVersion,
    recoverCanvas,
  } = useGranularWorkspaceAutosave({
    workspaceId,
    canvasVersion,
    onCanvasSaved,
    beforePersist: flushRegisteredAuthoring,
  });

  const flushAll = useCallback(async () => {
    await flushRegisteredAuthoring();
    await flushGranular();
  }, [flushGranular, flushRegisteredAuthoring]);

  const updateCanvas = useCallback((canvas: Snapshot) => {
    current.current = applyCanvasSnapshot(current.current, canvas);
    scheduleCanvas(canvas);
  }, [scheduleCanvas]);

  const retryConflict = useCallback(async () => {
    const latest = await getWorkspaceCanvas(workspaceId);
    current.current = acknowledgeCanvasSnapshot(current.current, latest.canvas);
    touch();
    await recoverCanvas(latest.version, current.current.canvas);
  }, [recoverCanvas, touch, workspaceId]);

  const useSavedCanvas = useCallback(async () => {
    const latest = await getWorkspaceCanvas(workspaceId);
    await recoverCanvas(latest.version);
    current.current = applyCanvasSnapshot(current.current, latest.canvas);
    touch();
  }, [recoverCanvas, touch, workspaceId]);

  const reconcileWorkspace = useCallback((next: {
    workspaceId: string;
    canvasVersion: number;
    content: WorkspaceContent;
  }) => {
    if (next.workspaceId !== identity.current.workspaceId) {
      if (!rebaseVersion(next.canvasVersion)) return "remote-conflict" as const;
      current.current = next.content;
      identity.current = { workspaceId: next.workspaceId, canvasVersion: next.canvasVersion };
      touch();
      return "rehydrated" as const;
    }

    if (next.canvasVersion === identity.current.canvasVersion) {
      if (current.current.title !== next.content.title) {
        current.current = { ...current.current, title: next.content.title };
        touch();
      }
      return "metadata-updated" as const;
    }

    if (granularDirty || !rebaseVersion(next.canvasVersion)) return "remote-conflict" as const;
    current.current = next.content;
    identity.current = { workspaceId: next.workspaceId, canvasVersion: next.canvasVersion };
    touch();
    return "rehydrated" as const;
  }, [granularDirty, rebaseVersion, touch]);

  return {
    current,
    status,
    dirty: granularDirty,
    flushAll,
    registerAuthoringFlush,
    reconcileWorkspace,
    updateCanvas,
    retryConflict,
    useSavedCanvas,
    registerCanvasExport,
    readCanvasExport,
  };
}
