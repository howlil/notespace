import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, FileText, Highlighter, MoreHorizontal, MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton, Input, Skeleton, cn } from "../../../shared/ui";
import { useExclusivePopup } from "../../../shared/ui/dismissable";
import { useTheme } from "../../../shared/ui/theme-provider";
import { useToast } from "../../../shared/ui/toast-provider";
import { workspaceContentOf } from "../../../domain/workspace/workspace";
import type { Note, Workspace, Snapshot } from "../../../domain/workspace/workspace";
import { normalizeWorkspaceContent } from "../model/workspace-content";
import { findPane, findSplit, leaves } from "../model/pane-layout";
import type { Pane, PaneNode } from "../model/pane-layout";
import { useWorkspaceSession } from "../model/use-workspace-session";
import { useWorkspaceCommands } from "../model/use-workspace-commands";
import { useWorkspacePaneLayout } from "../model/use-workspace-pane-layout";
import { registerDesktopFlush } from "../../../adapters/browser/desktop-lifecycle";
import { workspaceRenameTitle } from "../../../domain/workspace/naming";
import { findCanvasNoteArtifactId } from "../canvas/canvas-note-artifact";
import { paneMenuButtonClass, popupClass } from "./workspace-ui-classes";

const DocumentEditor = lazy(() => import("../document/DocumentEditor"));
const CanvasEditor = lazy(() => import("../canvas/CanvasEditor"));
export type WorkspaceAuthoringContext = { workspaceId: string; workspaceTitle: string };

type UseWorkspaceAuthoringOptions = {
  workspace: Workspace;
  onWorkspaceActive?: (context: WorkspaceAuthoringContext) => void;
};

const editorLoadingClass = "grid flex-1 place-items-center p-10 text-center text-xs text-muted";

function useCompactPaneLayout() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return compact;
}

function EditorLoading({ label }: { label: string }) {
  return (
    <div className={`${editorLoadingClass} gap-3`} role="status" aria-label={label}>
      <div className="grid w-full max-w-[300px] gap-2 rounded-lg border border-line bg-surface p-4 text-left" aria-hidden="true">
        <Skeleton className="h-2 w-16" />
        <Skeleton className="h-4 w-[72%]" />
        <Skeleton className="h-2 w-[46%] opacity-70" />
        <div className="mt-2 grid gap-2 border-t border-line pt-3"><Skeleton className="h-8 w-full rounded-md" /><Skeleton className="h-8 w-[82%] rounded-md opacity-70" /></div>
      </div>
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  );
}

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div className={`${editorLoadingClass} gap-3`} role="alert">
        <p className="m-0 max-w-[320px]">This editor could not open. Your stored content is preserved.</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => this.setState({ failed: false })}>Retry</Button>
      </div>
    ) : this.props.children;
  }
}

export function useWorkspaceAuthoring({ workspace, onWorkspaceActive }: UseWorkspaceAuthoringOptions) {
  const { dark } = useTheme();
  const { showToast } = useToast();
  const compactPanes = useCompactPaneLayout();
  const [normalized] = useState(() => normalizeWorkspaceContent(workspaceContentOf(workspace)));
  const initial = normalized.content;
  const session = useWorkspaceSession({
    workspaceId: workspace.id,
    canvasVersion: workspace.canvasVersion,
    initial,
  });
  const {
    current,
    touch: touchContent,
    status,
    dirty,
    scheduleNote,
    flushNote,
    forgetNote,
    flushAll,
    setPaneSnapshotDirty,
    registerPaneSnapshotFlush,
    updateNoteDocument,
    updateCanvas,
  } = session;
  const commands = useWorkspaceCommands({
    workspaceId: workspace.id,
    current,
    touchContent,
    scheduleNote,
    flushNote,
    forgetNote,
  });
  const paneLayout = useWorkspacePaneLayout({
    workspaceId: workspace.id,
    initialNoteIds: initial.notes.map((note) => note.id),
    notes: current.current.notes,
  });
  const {
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
    interaction: paneInteraction,
    focusMode,
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
  } = paneLayout;
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [renamingNote, setRenamingNote] = useState<{ paneId: string; noteId: string } | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [workspaceTitle, setWorkspaceTitle] = useState(workspace.title);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState(workspace.title);
  const [workspaceRenamePending, setWorkspaceRenamePending] = useState(false);
  const noteRenameInput = useRef<HTMLInputElement>(null);
  const workspaceRenameInput = useRef<HTMLInputElement>(null);
  const workspaceRenameSubmitting = useRef(false);
  useExclusivePopup(!!deletingNote, () => setDeletingNote(null));
  const currentWorkspaceTitle = current.current.title;

  useEffect(() => {
    onWorkspaceActive?.({
      workspaceId: workspace.id,
      workspaceTitle: currentWorkspaceTitle,
    });
  }, [currentWorkspaceTitle, onWorkspaceActive, workspace.id]);
  useEffect(() => {
    if (!normalized.changed) return;
    for (const note of current.current.notes) scheduleNote(note);
  }, [current, normalized.changed, scheduleNote]);
  useEffect(() => {
    if (status.state === "error") {
      showToast({ kind: "error", message: status.message ?? "Save failed. Please retry.", action: { label: "Retry save", onClick: () => void flushAll().catch(() => {}) } });
    }
    if (status.state === "conflict") {
      showToast({ kind: "error", message: status.message ?? "Autosave paused. Preserve the local draft before reloading." });
    }
  }, [flushAll, showToast, status]);
  useEffect(() => {
    setWorkspaceTitle(workspace.title);
    setWorkspaceTitleDraft(workspace.title);
    setRenamingWorkspace(false);
  }, [workspace.id, workspace.title]);
  useEffect(() => {
    const keepPaneMenuClicksLocal = (event: MouseEvent) => {
      if ((event.target as Element).closest(".pane-actions > summary, .pane-note-switcher > summary, .workspace-switcher > summary")) event.stopPropagation();
    };
    document.addEventListener("mousedown", keepPaneMenuClicksLocal, true);
    return () => document.removeEventListener("mousedown", keepPaneMenuClicksLocal, true);
  }, []);
  useEffect(() => { if (renamingNote) { noteRenameInput.current?.focus(); noteRenameInput.current?.select(); } }, [renamingNote]);
  useEffect(() => { if (renamingWorkspace) { workspaceRenameInput.current?.focus(); workspaceRenameInput.current?.select(); } }, [renamingWorkspace]);
  useBlocker({
    shouldBlockFn: async () => {
      if (status.state === "conflict") return true;
      if (!dirty) return false;
      try {
        await flushAll();
        return false;
      } catch (error) {
        showToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Save failed. Please retry.",
          action: { label: "Retry save", onClick: () => void flushAll().catch(() => {}) },
        });
        return true;
      }
    },
    enableBeforeUnload: () => dirty,
  });
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") void flushAll().catch(() => {}); };
    document.addEventListener("visibilitychange", flush);
    return () => { document.removeEventListener("visibilitychange", flush); void flushAll().catch(() => {}); };
  }, [flushAll]);
  useEffect(() => registerDesktopFlush(flushAll), [flushAll]);

  const updateDocument = useCallback((paneId: string, document: Snapshot) => {
    const pane = findPane(layout, paneId);
    if (!pane?.noteId) return;
    updateNoteDocument(pane.noteId, document);
  }, [layout, updateNoteDocument]);
  async function createNote(paneId: string) {
    const note = await commands.createNote();
    if (note) switchPaneNote(paneId, note.id);
  }
  function beginRenameNote(pane: Pane, noteId = pane.noteId) {
    if (!noteId) return;
    const note = current.current.notes.find((item) => item.id === noteId);
    if (!note) return;
    setNoteTitle(note.title);
    setRenamingNote({ paneId: pane.id, noteId });
  }
  function beginRenameWorkspace() {
    setWorkspaceTitleDraft(workspaceTitle);
    setRenamingWorkspace(true);
  }
  function cancelRenameWorkspace() {
    if (workspaceRenameSubmitting.current) return;
    setWorkspaceTitleDraft(workspaceTitle);
    setRenamingWorkspace(false);
  }
  async function commitRenameWorkspace() {
    if (workspaceRenameSubmitting.current) return;
    const value = workspaceRenameTitle(workspaceTitleDraft, workspaceTitle);
    if (!value) {
      cancelRenameWorkspace();
      return;
    }
    workspaceRenameSubmitting.current = true;
    setWorkspaceRenamePending(true);
    try {
      const renamedTitle = await commands.renameWorkspace(value);
      if (renamedTitle) {
        setWorkspaceTitle(renamedTitle);
        setWorkspaceTitleDraft(renamedTitle);
        setRenamingWorkspace(false);
      }
    } finally {
      workspaceRenameSubmitting.current = false;
      setWorkspaceRenamePending(false);
    }
  }
  function commitRenameNote(pane: Pane) {
    const value = noteTitle.trim();
    const noteId = renamingNote?.paneId === pane.id ? renamingNote.noteId : pane.noteId;
    if (!noteId || !value) { setRenamingNote(null); return; }
    commands.renameNote(noteId, value);
    setRenamingNote(null);
  }
  async function removeNote() {
    if (!deletingNote || current.current.notes.length <= 1) return;
    const result = await commands.deleteNote(deletingNote.id);
    if (!result) return;
    const target = leaves(layout).find((pane) => pane.noteId === result.deletedId);
    if (target) switchPaneNote(target.id, result.replacementId);
    setDeletingNote(null);
  }
  function openNoteFromCanvas(noteId: string) {
    if (!activateNote(noteId)) {
      showToast({ kind: "error", message: "This linked note no longer exists." });
      return;
    }

  }

  function openCanvasFrame(frameId: string) {

    focusCanvasFrame(frameId);
  }

  function selectionContext(pane: Pane, content: ReactNode) {
    if (pane.kind !== "note") return content;
    const textSelection = selectedTextPaneId === pane.id;
    return <ContextMenu>
      <ContextMenuTrigger asChild><div className="pane-content-context flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">{content}</div></ContextMenuTrigger>
      {textSelection && <ContextMenuContent>
        <ContextMenuItem onSelect={highlightSelectedText}><Highlighter size={13} /> Highlight text</ContextMenuItem>
      </ContextMenuContent>}
    </ContextMenu>;
  }

  function renderPane(pane: Pane) {
    const note = pane.noteId ? current.current.notes.find((item) => item.id === pane.noteId) : undefined;
    const linkedCanvasElementId = note ? findCanvasNoteArtifactId(current.current.canvas, note.id) : null;
    const isActive = pane.id === activePaneId;
    const interaction = paneInteraction;
    const paneCapacityTitle = interaction.paneLimitReached ? "Maximum 4 panes per workspace." : undefined;
    const noUnusedNoteTitle = !interaction.hasUnopenedNote ? "Create another note before opening another note pane." : undefined;
    const noteHeader = pane.kind === "note" && (
      renamingNote?.paneId === pane.id ? (
        <Input ref={noteRenameInput} className="min-h-0 w-[45%] min-w-0 rounded-none border-0 bg-transparent px-0 py-1 text-[10px]" aria-label="Note title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} onBlur={() => commitRenameNote(pane)} onKeyDown={(event) => { if (event.key === "Enter") commitRenameNote(pane); if (event.key === "Escape") setRenamingNote(null); }} />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <details className="pane-note-switcher relative min-w-0 [&>summary::-webkit-details-marker]:hidden">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 text-[10px] text-ink" onDoubleClick={(event) => { event.preventDefault(); beginRenameNote(pane); }}><FileText size={14} /><span className="max-w-[25vw] overflow-hidden text-ellipsis whitespace-nowrap max-[760px]:max-w-[62vw]">{note?.title ?? "Untitled"}</span><ChevronDown size={13} /></summary>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => beginRenameNote(pane)}><Pencil size={13} /> Rename note</ContextMenuItem>
                <ContextMenuItem disabled={current.current.notes.length <= 1} onSelect={() => { if (note) setDeletingNote(note); }}><Trash2 size={13} /> Delete note</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <div className={cn(popupClass, "top-7 right-auto left-0")} role="listbox" aria-label="Notes in this workspace">
              {current.current.notes.map((item) => <ContextMenu key={item.id}>
                <ContextMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className={cn("!min-h-0 w-full justify-start", paneMenuButtonClass)} role="option" aria-selected={item.id === pane.noteId} onClick={() => switchPaneNote(pane.id, item.id)} onDoubleClick={(event) => { event.preventDefault(); switchPaneNote(pane.id, item.id); beginRenameNote(pane, item.id); }}>{item.title}</Button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => switchPaneNote(pane.id, item.id)}><MoveRight size={13} /> Move to this pane</ContextMenuItem>
                  <ContextMenuItem onSelect={() => { switchPaneNote(pane.id, item.id); beginRenameNote(pane, item.id); }}><Pencil size={13} /> Rename note</ContextMenuItem>
                  <ContextMenuItem disabled={current.current.notes.length <= 1} onSelect={() => setDeletingNote(item)}><Trash2 size={13} /> Delete note</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>)}
            </div>
          </details>
          <IconButton type="button" className="!size-6 text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent" aria-label="New note" title="New note" onClick={() => createNote(pane.id)}><Plus size={14} /></IconButton>
          {linkedCanvasElementId && <IconButton type="button" className="!size-6 text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent" aria-label="Show linked note on Canvas" title="Show on Canvas" onClick={() => openCanvasFrame(linkedCanvasElementId)}><ExternalLink size={13} /></IconButton>}
        </div>
      )
    );
    const toolbarTargetId = `note-pane-toolbar-${pane.id}`;
    const articleMode = pane.kind === "note" && (leaves(layout).length === 1 || maximizedPaneId === pane.id);
    const surface = pane.kind === "note" && note ? (
      <EditorBoundary><Suspense fallback={<EditorLoading label="Opening note…" />}><DocumentEditor key={`${pane.id}:${note.id}`} workspaceId={workspace.id} initial={note.document} onChange={(document) => updateDocument(pane.id, document)} onDirtyChange={(value) => setPaneSnapshotDirty(pane.id, value)} registerSnapshotFlush={(flush) => registerPaneSnapshotFlush(pane.id, flush)} onBlockSelect={(_, hasTextSelection) => setSelectedTextPaneId(hasTextSelection ? pane.id : null)} highlightRequest={highlightRequest?.paneId === pane.id ? highlightRequest.request : null} focusRequest={documentFocus} toolbarTargetId={toolbarTargetId} articleMode={articleMode} getCanvasSnapshot={() => current.current.canvas} onOpenCanvasFrame={openCanvasFrame} /></Suspense></EditorBoundary>
    ) : (
      <EditorBoundary><Suspense fallback={<EditorLoading label="Opening Canvas…" />}><CanvasEditor workspaceId={workspace.id} initial={current.current.canvas} onChange={updateCanvas} focusRequest={canvasFocus} dark={dark} notes={current.current.notes} onOpenNote={openNoteFromCanvas} /></Suspense></EditorBoundary>
    );

    return (
      <section key={pane.id} className={cn("grid h-full min-h-0 min-w-0 w-full overflow-visible bg-surface", pane.kind === "note" ? "grid-rows-[34px_minmax(0,1fr)]" : "grid-rows-[minmax(0,1fr)]", isActive && "border-transparent")} onMouseDown={() => setActivePaneId(pane.id)} aria-label={pane.kind === "canvas" ? "Canvas pane" : `${note?.title ?? "Note"} note pane`}>
        {pane.kind === "note" && <header className="flex min-w-0 items-center justify-between gap-2 border-b border-line pr-2 pl-[11px]">
          {noteHeader}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <div id={toolbarTargetId} className="flex items-center gap-0.5" />
            <details className="pane-actions relative min-w-0 [&>summary::-webkit-details-marker]:hidden">
              <summary className="grid size-[26px] cursor-pointer list-none place-items-center text-muted hover:text-ink" aria-label={`Actions for ${note?.title ?? "Note"}`}><MoreHorizontal size={17} /></summary>
              <div className={cn(popupClass, "pane-menu top-7 right-0")}>
                <Button variant="ghost" size="sm" className={cn("!min-h-0 w-full justify-start", paneMenuButtonClass)} disabled={!interaction.canSplitNote} title={paneCapacityTitle ?? noUnusedNoteTitle} onClick={() => splitPane(pane.id, "row")}>Split right</Button>
                <Button variant="ghost" size="sm" className={cn("!min-h-0 w-full justify-start", paneMenuButtonClass)} disabled={!interaction.canSplitNote} title={paneCapacityTitle ?? noUnusedNoteTitle} onClick={() => splitPane(pane.id, "column")}>Split down</Button>
                <Button variant="ghost" size="sm" className={cn("!min-h-0 w-full justify-start", paneMenuButtonClass)} disabled={!interaction.canClosePane} onClick={() => closePane(pane.id)}>Close pane</Button>
                <Button variant="ghost" size="sm" className={cn("!min-h-0 w-full justify-start", paneMenuButtonClass)} disabled={current.current.notes.length <= 1} onClick={() => { if (note) setDeletingNote(note); }}>Delete note</Button>
              </div>
            </details>
          </div>
        </header>}
        {selectionContext(pane, surface)}
      </section>
    );
  }

  function renderNode(node: PaneNode): ReactNode {
    if (node.kind === "leaf") return renderPane(node.pane);
    const ratio = node.ratio;
    const direction = node.direction === "row" && compactPanes ? "column" : node.direction;
    return (
      <div className={cn("grid h-full min-h-0 min-w-0 w-full gap-0 [&>div]:grid [&>div]:min-h-0 [&>div]:min-w-0", direction === "column" && "grid-cols-1", node.direction === "row" && "max-[760px]:!grid-cols-1 max-[760px]:!grid-rows-[minmax(0,1fr)_7px_minmax(0,1fr)]")} key={node.id} style={direction === "row" ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` } : { gridTemplateRows: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` }}>
        {renderNode(node.first)}
        <div className={cn("relative z-5 grid place-items-center bg-transparent after:absolute after:top-1/2 after:left-1/2 after:h-[14px] after:w-[3px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[color-mix(in_srgb,var(--line)_72%,transparent)] after:opacity-80 after:content-[''] hover:after:h-[18px] hover:after:w-1 hover:after:bg-accent focus-visible:after:h-[18px] focus-visible:after:w-1 focus-visible:after:bg-accent", direction === "row" ? "cursor-col-resize" : "cursor-row-resize after:h-[3px] after:w-[14px] hover:after:h-[3px] hover:after:w-[18px] focus-visible:after:h-[3px] focus-visible:after:w-[18px]")} role="separator" tabIndex={0} aria-label={`Resize ${direction === "row" ? "horizontal" : "vertical"} panes`} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") resizeSplit(node.id, ratio - .05); if (event.key === "ArrowRight" || event.key === "ArrowDown") resizeSplit(node.id, ratio + .05); }} onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = direction === "row" ? event.clientX : event.clientY;
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          if (!bounds) return;
          const size = direction === "row" ? bounds.width : bounds.height;
          const move = (moveEvent: PointerEvent) => { const position = direction === "row" ? moveEvent.clientX : moveEvent.clientY; resizeSplit(node.id, ratio + (position - start) / size); };
          const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", stop);
        }} />
        <div>{renderNode(node.second)}</div>
      </div>
    );
  }

  const maximizedSplit = maximizedSplitId ? findSplit(layout, maximizedSplitId) : undefined;
  const authoringVisible = maximizedPaneId ? (findPane(layout, maximizedPaneId) ? renderPane(findPane(layout, maximizedPaneId)!) : renderNode(layout)) : maximizedSplit ? renderNode(maximizedSplit) : renderNode(layout);

  return {
    authoringVisible,
    focusMode,
    activeViewMode,
    selectView,
    clearMaximize,
    toggleActiveMaximize,
    maximizeLabel,
    status,
    renamingWorkspace,
    workspaceTitle,
    currentWorkspaceTitle: current.current.title,
    workspaceTitleDraft,
    workspaceRenamePending,
    workspaceRenameInput,
    beginRenameWorkspace,
    cancelRenameWorkspace,
    commitRenameWorkspace,
    setWorkspaceTitleDraft,
    overlays: (
      <Dialog open={!!deletingNote} onOpenChange={(open) => { if (!open) setDeletingNote(null); }}>
        <DialogContent><DialogTitle>Delete this note?</DialogTitle><DialogDescription>“{deletingNote?.title}” will be removed from this workspace.</DialogDescription><DialogFooter><DialogClose asChild><Button variant="secondary">Keep note</Button></DialogClose><Button variant="danger" onClick={removeNote}>Delete note</Button></DialogFooter></DialogContent>
      </Dialog>
    ),
  };
}
