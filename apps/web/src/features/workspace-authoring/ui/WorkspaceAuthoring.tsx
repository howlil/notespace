import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { FileText, Plus, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, IconButton, Input } from "../../../shared/ui";
import { useTheme } from "../../../shared/ui/theme-provider";
import { useToast } from "../../../shared/ui/toast-provider";
import { workspaceContentOf } from "../../../domain/workspace/workspace";
import type { Workspace } from "../../../domain/workspace/workspace";
import { normalizeWorkspaceContent } from "../model/workspace-content";
import { useWorkspaceSession } from "../model/use-workspace-session";
import { useWorkspaceCommands } from "../model/use-workspace-commands";
import { registerDesktopFlush } from "../../../adapters/browser/desktop-lifecycle";

const CanvasEditor = lazy(() => import("../canvas/CanvasEditor"));
const DocumentEditor = lazy(() => import("../document/DocumentEditor"));

/**
 * The Canvas owns the permanent authored surface. Notes remain versioned
 * records and open in one temporary Tiptap editor, never in a shadow copy.
 */
export function useWorkspaceAuthoring({ workspace }: { workspace: Workspace }) {
  const { dark } = useTheme();
  const { showToast } = useToast();
  const [normalized] = useState(() => normalizeWorkspaceContent(workspaceContentOf(workspace)));
  const initial = normalized.content;
  const session = useWorkspaceSession({
    workspaceId: workspace.id,
    canvasVersion: workspace.canvasVersion,
    initial,
  });
  const {
    current, touch, status, dirty, scheduleNote, flushNote, forgetNote,
    flushAll, setPaneSnapshotDirty, registerPaneSnapshotFlush,
    updateNoteDocument, updateCanvas,
  } = session;
  const commands = useWorkspaceCommands({
    workspaceId: workspace.id,
    current,
    touchContent: touch,
    scheduleNote,
    flushNote,
    forgetNote,
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("note"));
  const [noteTitleDraft, setNoteTitleDraft] = useState("");
  const [closingNote, setClosingNote] = useState(false);
  const [canvasFocus, setCanvasFocus] = useState<{ id: string; request: number } | null>(null);
  const focusRequestNumber = useRef(0);
  const blockId = new URLSearchParams(window.location.search).get("block");
  const [documentFocus] = useState(() => blockId
    ? { id: blockId, request: 1 } : null);
  const selectedNote = current.current.notes.find((note) => note.id === selectedNoteId);
  const currentWorkspaceTitle = current.current.title;

  useEffect(() => {
    if (!normalized.changed) return;
    for (const note of current.current.notes) scheduleNote(note);
  }, [normalized.changed, current, scheduleNote]);

  const retrySave = useCallback(() => {
    void flushAll().catch((error: unknown) => {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Save failed. Try again." });
    });
  }, [flushAll, showToast]);

  useEffect(() => {
    if (status.state === "error") {
      showToast({
        id: `workspace-save-${workspace.id}`,
        kind: "error",
        message: status.message ?? "Could not save changes.",
        action: { label: "Retry save", onClick: retrySave, dismissOnClick: false },
      });
    } else if (status.state === "conflict") {
      showToast({
        id: `workspace-conflict-${workspace.id}`,
        kind: "error",
        message: status.message ?? "Save conflict. Preserve your local draft before reloading.",
        duration: Infinity,
      });
    }
  }, [status, retrySave, showToast, workspace.id]);

  // All transitions must settle the active editor snapshot before the
  // authoring session unmounts; a stale Note version must never be replayed.
  useBlocker({
    shouldBlockFn: async () => {
      if (status.state === "conflict") return true;
      try {
        await flushAll();
        return false;
      } catch (error) {
        showToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Save failed. Please retry.",
          action: { label: "Retry save", onClick: retrySave, dismissOnClick: false },
        });
        return true;
      }
    },
    enableBeforeUnload: () => dirty,
  });
  useEffect(() => registerDesktopFlush(flushAll), [flushAll]);
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") void flushAll().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      void flushAll().catch(() => {});
    };
  }, [flushAll]);

  function openNote(noteId: string) {
    const note = current.current.notes.find((item) => item.id === noteId);
    if (!note) {
      showToast({ kind: "error", message: "That Note is no longer available." });
      return;
    }
    setNoteTitleDraft(note.title);
    setSelectedNoteId(noteId);
  }

  async function createNote() {
    const note = await commands.createNote();
    if (!note) return;
    touch();
    openNote(note.id);
  }

  async function closeNote() {
    if (closingNote) return;
    setClosingNote(true);
    try {
      // The editor remains mounted until its snapshot flusher and versioned
      // write have both settled.
      await flushAll();
      setSelectedNoteId(null);
    } catch (error) {
      showToast({
        kind: "error",
        message: error instanceof Error ? error.message : "Note was not saved. Retry closing it.",
      });
    } finally {
      setClosingNote(false);
    }
  }

  function commitTitle() {
    if (!selectedNote) return;
    const title = noteTitleDraft.trim();
    if (title && title !== selectedNote.title) {
      commands.renameNote(selectedNote.id, title);
      touch();
    }
  }

  function focusCanvasFrame(frameId: string) {
    setCanvasFocus({ id: frameId, request: ++focusRequestNumber.current });
    void closeNote();
  }

  const authoringVisible = (
    <div className="relative h-full min-h-0 min-w-0 w-full overflow-hidden bg-canvas">
      <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted" role="status">Opening Canvas…</div>}>
        <CanvasEditor
          workspaceId={workspace.id}
          initial={current.current.canvas}
          onChange={updateCanvas}
          focusRequest={canvasFocus}
          dark={dark}
          notes={current.current.notes}
          onOpenNote={openNote}
        />
      </Suspense>
      <div className="pointer-events-none absolute bottom-3 right-3 z-30">
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5">
          <select
            aria-label="Open an existing Note"
            className="max-w-40 bg-transparent text-[11px] text-ink"
            value=""
            onChange={(event) => openNote(event.target.value)}
          >
            <option value="">Open Note…</option>
            {current.current.notes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
          </select>
          <IconButton type="button" aria-label="New Note" title="New Note" className="!size-7" onClick={() => void createNote()}>
            <Plus size={15} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </div>
  );

  const overlays = (
    <Dialog open={!!selectedNote} onOpenChange={(open) => { if (!open) void closeNote(); }}>
      <DialogContent
        className="flex h-[min(86dvh,900px)] w-[min(94vw,1050px)] max-w-none flex-col gap-0 overflow-hidden p-0"
        data-notespace-note-editor
        aria-label="Note editor"
        onEscapeKeyDown={(event) => { event.preventDefault(); void closeNote(); }}
        onInteractOutside={(event) => { event.preventDefault(); }}
      >
        {selectedNote && (
          <>
            <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line px-3">
              <FileText size={15} className="text-muted" aria-hidden="true" />
              <DialogTitle className="sr-only">Edit Note</DialogTitle>
              <Input
                aria-label="Note title"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold"
                value={noteTitleDraft || selectedNote.title}
                onChange={(event) => setNoteTitleDraft(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTitle(); } }}
              />
              <span className="text-[10px] text-muted" role="status">
                {status.state === "saved" ? "Saved" : status.state === "saving" ? "Saving…" : status.state === "conflict" ? "Conflict" : "Unsaved"}
              </span>
              <Button type="button" variant="secondary" size="sm" disabled={closingNote} onClick={() => void closeNote()}>
                {closingNote ? "Saving…" : "Done"}
              </Button>
              <IconButton type="button" aria-label="Close Note" className="!size-7" disabled={closingNote} onClick={() => void closeNote()}>
                <X size={15} />
              </IconButton>
            </header>
            <div id="notespace-note-toolbar" className="shrink-0" />
            <div className="min-h-0 flex-1 overflow-auto bg-surface">
              <Suspense fallback={<div className="p-5 text-xs text-muted" role="status">Opening Note…</div>}>
                <DocumentEditor
                  key={selectedNote.id}
                  workspaceId={workspace.id}
                  initial={selectedNote.document}
                  onChange={(snapshot) => updateNoteDocument(selectedNote.id, snapshot)}
                  onDirtyChange={(value) => setPaneSnapshotDirty("note-overlay", value)}
                  registerSnapshotFlush={(flush) => registerPaneSnapshotFlush("note-overlay", flush)}
                  focusRequest={documentFocus}
                  toolbarTargetId="notespace-note-toolbar"
                  articleMode
                  getCanvasSnapshot={() => current.current.canvas}
                  onOpenCanvasFrame={focusCanvasFrame}
                />
              </Suspense>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return { authoringVisible, overlays, status, currentWorkspaceTitle };
}
