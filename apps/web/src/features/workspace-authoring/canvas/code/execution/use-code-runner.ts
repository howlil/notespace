import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canRunCode,
  startJavaScriptRun,
  type JavaScriptRunHandle,
  type JavaScriptRunResult,
} from "./code-runner.ts";

export type RunnableCode = {
  code: string;
  language: string;
};

export type LiveRunnableCode = RunnableCode & { id: string };

export type CodeRunView =
  | { status: "running"; stdout: string[]; stderr: string[] }
  | JavaScriptRunResult;

type CodeRunEntry = { source: RunnableCode; view: CodeRunView };

export function sameRunnableCode(left: RunnableCode, right: RunnableCode) {
  return left.code === right.code && left.language === right.language;
}

export function currentCodeRuns(entries: Record<string, CodeRunEntry>, liveSources: ReadonlyMap<string, RunnableCode>) {
  return Object.fromEntries(Object.entries(entries).flatMap(([id, entry]) => {
    const current = liveSources.get(id);
    return current && sameRunnableCode(entry.source, current) ? [[id, entry.view]] : [];
  })) as Record<string, CodeRunView>;
}

export function useCodeRunner(liveBlocks: readonly LiveRunnableCode[]) {
  const [runEntries, setRunEntries] = useState<Record<string, CodeRunEntry>>({});
  const runHandles = useRef(new Map<string, { handle: JavaScriptRunHandle; source: RunnableCode }>());
  const liveSources = useMemo(() => new Map(liveBlocks.map(({ id, code, language }) => [id, { code, language }])), [liveBlocks]);
  const liveSourcesRef = useRef(liveSources);
  liveSourcesRef.current = liveSources;
  const runs = useMemo(() => currentCodeRuns(runEntries, liveSources), [runEntries, liveSources]);

  const clearRun = useCallback((id: string) => {
    const run = runHandles.current.get(id);
    runHandles.current.delete(id);
    run?.handle.stop();
    setRunEntries((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const stopRun = useCallback((id: string) => {
    runHandles.current.get(id)?.handle.stop();
  }, []);

  const runBlock = useCallback((id: string, block: RunnableCode) => {
    if (!canRunCode(block.language)) return;
    runHandles.current.get(id)?.handle.stop();

    const source = { code: block.code, language: block.language };
    const handle = startJavaScriptRun(block.code, undefined, (output) => {
      if (runHandles.current.get(id)?.handle !== handle) return;
      if (!sameRunnableCode(source, liveSourcesRef.current.get(id) ?? { code: "", language: "" })) return;
      setRunEntries((current) => ({ ...current, [id]: { source, view: { status: "running", ...output } } }));
    });
    runHandles.current.set(id, { handle, source });
    setRunEntries((current) => ({
      ...current,
      [id]: { source, view: { status: "running", stdout: [], stderr: [] } },
    }));

    void handle.result.then((result) => {
      if (runHandles.current.get(id)?.handle !== handle) return;
      runHandles.current.delete(id);
      if (!sameRunnableCode(source, liveSourcesRef.current.get(id) ?? { code: "", language: "" })) return;
      setRunEntries((current) => ({ ...current, [id]: { source, view: result } }));
    });
  }, []);

  useEffect(() => {
    for (const [id, run] of runHandles.current) {
      const current = liveSources.get(id);
      if (current && sameRunnableCode(run.source, current)) continue;
      runHandles.current.delete(id);
      run.handle.stop();
    }
    setRunEntries((current) => {
      const entries = Object.entries(current).filter(([id, run]) => {
        const source = liveSources.get(id);
        return source && sameRunnableCode(run.source, source);
      });
      if (entries.length === Object.keys(current).length) return current;
      return Object.fromEntries(entries);
    });
  }, [liveSources]);

  useEffect(() => () => {
    for (const run of runHandles.current.values()) run.handle.stop();
    runHandles.current.clear();
  }, []);

  return { runs, runBlock, stopRun, clearRun };
}
