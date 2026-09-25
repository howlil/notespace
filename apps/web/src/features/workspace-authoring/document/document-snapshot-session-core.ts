import type { Snapshot } from "../../../domain/workspace/workspace.ts";

type TimerHandle = ReturnType<typeof setTimeout>;

export type DocumentSnapshotSessionDependencies = {
  readSnapshot: () => Record<string, unknown> | null;
  onChange: (snapshot: Snapshot) => void;
  onDirtyChange?: (dirty: boolean) => void;
  delay?: number;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

export function createDocumentSnapshotSession({
  readSnapshot,
  onChange,
  onDirtyChange,
  delay = 120,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: DocumentSnapshotSessionDependencies) {
  let timer: TimerHandle | null = null;
  let pending = false;

  const flush = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (!pending) return false;

    const data = readSnapshot();
    if (!data) return false;

    pending = false;
    onChange({ format: "tiptap", version: 1, data });
    onDirtyChange?.(false);
    return true;
  };

  const schedule = () => {
    if (!pending) {
      pending = true;
      onDirtyChange?.(true);
    }
    if (timer !== null) return;

    timer = setTimer(() => {
      timer = null;
      flush();
    }, delay);
  };

  const hasPending = () => pending;

  const dispose = () => {
    flush();
  };

  return { schedule, flush, hasPending, dispose };
}
