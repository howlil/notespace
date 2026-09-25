import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { Snapshot } from "../../../domain/workspace/workspace";
import { createDocumentSnapshotSession } from "./document-snapshot-session-core";

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
  const session = useMemo(() => createDocumentSnapshotSession({
    readSnapshot: () => editorRef.current?.getJSON() ?? null,
    onChange: (snapshot) => onChangeRef.current(snapshot),
    onDirtyChange: (dirty) => onDirtyChangeRef.current?.(dirty),
    delay,
  }), [delay, editorRef]);

  useEffect(() => {
    const registerSnapshotFlush = registerSnapshotFlushRef.current;
    registerSnapshotFlush?.(session.flush);
    return () => {
      session.dispose();
      registerSnapshotFlush?.(null);
    };
  }, [session]);

  return {
    schedule: session.schedule,
    flush: session.flush,
    hasPending: session.hasPending,
  };
}
