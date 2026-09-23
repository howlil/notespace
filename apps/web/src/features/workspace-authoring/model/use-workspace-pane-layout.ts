import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "../../../domain/workspace/workspace";
import { writeLocalStorage } from "../../../shared/browser/local-storage";
import {
  findPane,
  findSplit,
  layoutForViewMode,
  leaves,
  mapNode,
  paneFocusTarget,
  paneInteractionState,
  removeNode,
  restoreLayout,
  updateSplit,
  workspaceViewMode,
  type PaneNode,
  type WorkspaceViewMode,
} from "./pane-layout";

type FocusRequest = { id: string; request: number } | null;

function newId() {
  return crypto.randomUUID();
}

export function useWorkspacePaneLayout({
  workspaceId,
  initialNoteIds,
  notes,
}: {
  workspaceId: string;
  initialNoteIds: readonly string[];
  notes: readonly Note[];
}) {
  const storageKey = `notespace.workspace-layout:${workspaceId}`;
  const [layout, setLayout] = useState<PaneNode>(() =>
    restoreLayout(storageKey, new Set(initialNoteIds)),
  );
  const [activePaneId, setActivePaneId] = useState(() => leaves(layout)[0]?.id ?? "");
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const [maximizedSplitId, setMaximizedSplitId] = useState<string | null>(null);
  const [selectedTextPaneId, setSelectedTextPaneId] = useState<string | null>(null);
  const [highlightRequest, setHighlightRequest] = useState<{ paneId: string; request: number } | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null);
  const [canvasFocus, setCanvasFocus] = useState<FocusRequest>(null);
  const navigationRequest = useRef(0);

  const noteIds = useMemo(() => notes.map((note) => note.id), [notes]);
  const interaction = useMemo(
    () => paneInteractionState(layout, noteIds),
    [layout, noteIds],
  );
  const focusMode = Boolean(maximizedPaneId || maximizedSplitId);
  const activePane = findPane(layout, activePaneId) ?? leaves(layout)[0];
  const activeFocusTarget = activePane ? paneFocusTarget(layout, activePane.id) : undefined;
  const maximizeLabel = focusMode
    ? "Restore layout"
    : activeFocusTarget?.kind === "split"
      ? "Maximize active split"
      : "Maximize active pane";
  const activeViewMode = workspaceViewMode(layout);

  const clearMaximize = useCallback(() => {
    setMaximizedPaneId(null);
    setMaximizedSplitId(null);
  }, []);

  useEffect(() => {
    writeLocalStorage(storageKey, JSON.stringify(layout));
  }, [layout, storageKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (maximizedPaneId || maximizedSplitId)) {
        clearMaximize();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [clearMaximize, maximizedPaneId, maximizedSplitId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const noteId = params.get("note");
    const blockId = params.get("block");
    if (noteId) {
      const pane = leaves(layout).find((item) => item.kind === "note" && item.noteId === noteId);
      if (pane) setActivePaneId(pane.id);
    }
    if (blockId) {
      setDocumentFocus({ id: blockId, request: ++navigationRequest.current });
    }
  }, [layout, workspaceId]);

  const switchPaneNote = useCallback((paneId: string, noteId: string) => {
    const duplicate = leaves(layout).find(
      (pane) => pane.kind === "note" && pane.noteId === noteId && pane.id !== paneId,
    );
    if (duplicate) {
      setActivePaneId(duplicate.id);
      return;
    }
    setLayout((value) =>
      mapNode(value, paneId, (node) =>
        node.kind === "leaf"
          ? { ...node, pane: { ...node.pane, kind: "note", noteId } }
          : node,
      ),
    );
    setActivePaneId(paneId);
    setSelectedTextPaneId(null);
    setHighlightRequest(null);
  }, [layout]);

  const closePane = useCallback((paneId: string) => {
    if (leaves(layout).length <= 1) return;
    const next = removeNode(layout, paneId);
    const remaining = leaves(next);
    setLayout(next);
    setActivePaneId((currentActivePaneId) =>
      remaining.some((pane) => pane.id === currentActivePaneId)
        ? currentActivePaneId
        : (remaining[0]?.id ?? ""),
    );
    if (maximizedPaneId === paneId) setMaximizedPaneId(null);
    if (maximizedSplitId && !findSplit(next, maximizedSplitId)) setMaximizedSplitId(null);
    setSelectedTextPaneId((selectedPaneId) => selectedPaneId === paneId ? null : selectedPaneId);
    setHighlightRequest((request) => request?.paneId === paneId ? null : request);
  }, [layout, maximizedPaneId, maximizedSplitId]);

  const splitPane = useCallback((paneId: string, direction: "row" | "column") => {
    if (!interaction.canSplitNote || !interaction.nextUnopenedNoteId) return;
    const source = findPane(layout, paneId);
    if (!source || source.kind === "canvas") return;
    const next: PaneNode = {
      kind: "leaf",
      pane: {
        id: newId(),
        kind: "note",
        noteId: interaction.nextUnopenedNoteId,
      },
    };
    setLayout((value) =>
      mapNode(value, paneId, (node) => ({
        kind: "split",
        id: newId(),
        direction,
        ratio: .5,
        first: node,
        second: next,
      })),
    );
    setActivePaneId(next.pane.id);
  }, [interaction, layout]);

  const selectView = useCallback((mode: WorkspaceViewMode) => {
    const preferredNoteId = activePane?.kind === "note" ? activePane.noteId : notes[0]?.id;
    const next = layoutForViewMode(layout, mode, preferredNoteId);
    setLayout(next);
    setActivePaneId(
      leaves(next).find((pane) =>
        mode === "canvas" ? pane.kind === "canvas" : pane.kind === "note",
      )?.id ?? leaves(next)[0]?.id ?? "",
    );
    clearMaximize();
  }, [activePane, clearMaximize, layout, notes]);

  const activateNote = useCallback((noteId: string) => {
    if (!notes.some((note) => note.id === noteId)) return false;
    const existingNotePane = leaves(layout).find(
      (pane) => pane.kind === "note" && pane.noteId === noteId,
    );
    if (existingNotePane) {
      setActivePaneId(existingNotePane.id);
    } else {
      const reusableNotePane = leaves(layout).find((pane) => pane.kind === "note");
      if (reusableNotePane) {
        switchPaneNote(reusableNotePane.id, noteId);
      } else {
        const next = layoutForViewMode(layout, "split", noteId);
        setLayout(next);
        setActivePaneId(
          leaves(next).find((pane) => pane.kind === "note" && pane.noteId === noteId)?.id
            ?? leaves(next)[0]?.id
            ?? "",
        );
      }
    }
    clearMaximize();
    return true;
  }, [clearMaximize, layout, notes, switchPaneNote]);

  const focusCanvasFrame = useCallback((frameId: string) => {
    const existingCanvasPane = leaves(layout).find((pane) => pane.kind === "canvas");
    if (existingCanvasPane) {
      setActivePaneId(existingCanvasPane.id);
    } else {
      const next = layoutForViewMode(layout, "canvas", notes[0]?.id);
      setLayout(next);
      setActivePaneId(
        leaves(next).find((pane) => pane.kind === "canvas")?.id
          ?? leaves(next)[0]?.id
          ?? "",
      );
    }
    clearMaximize();
    setCanvasFocus({ id: frameId, request: ++navigationRequest.current });
  }, [clearMaximize, layout, notes]);

  const toggleActiveMaximize = useCallback(() => {
    if (focusMode) {
      clearMaximize();
      return;
    }
    if (!activeFocusTarget) return;
    if (activeFocusTarget.kind === "split") {
      setMaximizedPaneId(null);
      setMaximizedSplitId(activeFocusTarget.id);
      return;
    }
    setMaximizedSplitId(null);
    setMaximizedPaneId(activeFocusTarget.id);
  }, [activeFocusTarget, clearMaximize, focusMode]);

  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((value) => updateSplit(value, splitId, ratio));
  }, []);

  const highlightSelectedText = useCallback(() => {
    if (!selectedTextPaneId) return;
    setHighlightRequest({
      paneId: selectedTextPaneId,
      request: ++navigationRequest.current,
    });
  }, [selectedTextPaneId]);

  return {
    layout,
    activePaneId,
    setActivePaneId,
    maximizedPaneId,
    maximizedSplitId,
    selectedTextPaneId,
    setSelectedTextPaneId,
    highlightRequest,
    documentFocus,
    canvasFocus,
    interaction,
    focusMode,
    activePane,
    maximizeLabel,
    activeViewMode,
    splitPane,
    switchPaneNote,
    closePane,
    selectView,
    activateNote,
    focusCanvasFrame,
    clearMaximize,
    toggleActiveMaximize,
    resizeSplit,
    highlightSelectedText,
  };
}
