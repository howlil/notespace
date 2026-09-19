import { useCallback, useEffect, useRef, useState } from "react";
import {
  canRunCanvasCode,
  startJavaScriptRun,
  type JavaScriptRunHandle,
  type JavaScriptRunResult,
} from "./canvas-code-runner";
import type { CanvasCodeBlockData } from "./canvas-code-block";

export type CodeRunView =
  | { status: "running"; stdout: string[]; stderr: string[] }
  | JavaScriptRunResult;

export function useCanvasCodeRunner(liveElementIds: readonly string[]) {
  const [runs, setRuns] = useState<Record<string, CodeRunView>>({});
  const runHandles = useRef(new Map<string, JavaScriptRunHandle>());

  const clearRun = useCallback((elementId: string) => {
    const handle = runHandles.current.get(elementId);
    runHandles.current.delete(elementId);
    handle?.stop();
    setRuns((current) => {
      if (!(elementId in current)) return current;
      const next = { ...current };
      delete next[elementId];
      return next;
    });
  }, []);

  const stopRun = useCallback((elementId: string) => {
    runHandles.current.get(elementId)?.stop();
  }, []);

  const runBlock = useCallback((elementId: string, block: CanvasCodeBlockData) => {
    if (!canRunCanvasCode(block.language)) return;
    runHandles.current.get(elementId)?.stop();

    const handle = startJavaScriptRun(block.code);
    runHandles.current.set(elementId, handle);
    setRuns((current) => ({
      ...current,
      [elementId]: { status: "running", stdout: [], stderr: [] },
    }));

    void handle.result.then((result) => {
      if (runHandles.current.get(elementId) !== handle) return;
      runHandles.current.delete(elementId);
      setRuns((current) => ({ ...current, [elementId]: result }));
    });
  }, []);

  useEffect(() => {
    const liveIds = new Set(liveElementIds);
    for (const [elementId, handle] of runHandles.current) {
      if (liveIds.has(elementId)) continue;
      runHandles.current.delete(elementId);
      handle.stop();
    }
    setRuns((current) => {
      const entries = Object.entries(current).filter(([elementId]) => liveIds.has(elementId));
      if (entries.length === Object.keys(current).length) return current;
      return Object.fromEntries(entries);
    });
  }, [liveElementIds]);

  useEffect(() => () => {
    for (const handle of runHandles.current.values()) handle.stop();
    runHandles.current.clear();
  }, []);

  return { runs, runBlock, stopRun, clearRun };
}
