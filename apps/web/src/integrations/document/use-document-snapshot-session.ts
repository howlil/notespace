import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Snapshot } from "../../domain/project/project";

export function useDocumentSnapshotSession({
  editorRef,
  onChange,
  onDirtyChange,
  registerSnapshotFlush,
  delay = 120,
}: {
  editorRef: RefObject<Editor | null>;
  onChange: (snapshot: Snapshot) => void;
  onDirtyChange?: (dirty: boolean) => void;
  registerSnapshotFlush?: (flush: (() => void) | null) => void;
  delay?: number;
}) {
  const onChangeRef = useRef(onChange);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const registerSnapshotFlushRef = useRef(registerSnapshotFlush);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);

  onChangeRef.current = onChange;
  onDirtyChangeRef.current = onDirtyChange;
  registerSnapshotFlushRef.current = registerSnapshotFlush;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!pendingRef.current) return;
    const editor = editorRef.current;
    if (!editor) return;

    pendingRef.current = false;
    onChangeRef.current({ format: "tiptap", version: 1, data: editor.getJSON() });
    onDirtyChangeRef.current?.(false);
  }, [editorRef]);

  const schedule = useCallback(() => {
    if (!pendingRef.current) {
      pendingRef.current = true;
      onDirtyChangeRef.current?.(true);
    }
    if (timerRef.current) return;

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, delay);
  }, [delay, flush]);

  const hasPending = useCallback(() => pendingRef.current, []);

  useEffect(() => {
    registerSnapshotFlushRef.current?.(flush);
    return () => {
      flush();
      registerSnapshotFlushRef.current?.(null);
    };
  }, [flush]);

  return { schedule, flush, hasPending };
}
