import { useCallback, useEffect, useRef, useState } from "react";
import {
  canRunCode,
  startJavaScriptRun,
  type JavaScriptRunHandle,
  type JavaScriptRunResult,
} from "./code-runner";

export type RunnableCode = {
  code: string;
  language: string;
};

export type CodeRunView =
  | { status: "running"; stdout: string[]; stderr: string[] }
  | JavaScriptRunResult;

export function useCodeRunner(liveIds: readonly string[]) {
  const [runs, setRuns] = useState<Record<string, CodeRunView>>({});
  const runHandles = useRef(new Map<string, JavaScriptRunHandle>());

  const clearRun = useCallback((id: string) => {
    const handle = runHandles.current.get(id);
    runHandles.current.delete(id);
    handle?.stop();
    setRuns((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const stopRun = useCallback((id: string) => {
    runHandles.current.get(id)?.stop();
  }, []);

  const runBlock = useCallback((id: string, block: RunnableCode) => {
    if (!canRunCode(block.language)) return;
    runHandles.current.get(id)?.stop();

    const handle = startJavaScriptRun(block.code);
    runHandles.current.set(id, handle);
    setRuns((current) => ({
      ...current,
      [id]: { status: "running", stdout: [], stderr: [] },
    }));

    void handle.result.then((result) => {
      if (runHandles.current.get(id) !== handle) return;
      runHandles.current.delete(id);
      setRuns((current) => ({ ...current, [id]: result }));
    });
  }, []);

  useEffect(() => {
    const live = new Set(liveIds);
    for (const [id, handle] of runHandles.current) {
      if (live.has(id)) continue;
      runHandles.current.delete(id);
      handle.stop();
    }
    setRuns((current) => {
      const entries = Object.entries(current).filter(([id]) => live.has(id));
      if (entries.length === Object.keys(current).length) return current;
      return Object.fromEntries(entries);
    });
  }, [liveIds]);

  useEffect(() => () => {
    for (const handle of runHandles.current.values()) handle.stop();
    runHandles.current.clear();
  }, []);

  return { runs, runBlock, stopRun, clearRun };
}
