import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, Circle, ExternalLink, FileText, Highlighter, Loader2, Maximize2, MoreHorizontal, MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton, Input, Skeleton, cn } from "../../shared/ui";
import { useExclusivePopup } from "../../shared/ui/dismissable";
import { useTheme } from "../../app/providers/theme-provider";
import { useToast } from "../../app/providers/toast-provider";
import { workspaceContentOf } from "../../domain/workspace/workspace";
import type { Note, Workspace, WorkspaceSummary, Snapshot } from "../../domain/workspace/workspace";
import { createWorkspaceNote, deleteWorkspaceNote, renameWorkspace } from "../../adapters/http/workspace-api";
import { StudyIndicator } from "../../features/study/StudyIndicator";
import { useActivityRuntime } from "../../features/study/activity-runtime-provider";
import { WorkspaceGuide } from "../../features/workspace/WorkspaceGuide";
import { blankDocument, normalizeProjectContent } from "../../features/workspace/workspace-content";
import { findPane, findSplit, layoutForViewMode, leaves, mapNode, paneFocusTarget, paneInteractionState, removeNode, restoreLayout, updateSplit, workspaceViewMode } from "../../features/workspace/pane-layout";
import type { Pane, PaneNode, WorkspaceViewMode } from "../../features/workspace/pane-layout";
import { useWorkspaceSession } from "../../features/workspace/use-workspace-session";
import { writeLocalStorage } from "../../adapters/browser/local-storage";
import { workspaceMutationError, workspaceRenameTitle } from "../../features/library/workspace-mutation-policy";
import { WorkspaceRenameField } from "../../features/workspace/WorkspaceRenameField";
import { WorkspaceViewSwitcher } from "../../features/workspace/WorkspaceViewSwitcher";
import { WorkspacePlan } from "../../features/plan/WorkspacePlan";
import { findCanvasNoteArtifactId } from "../../integrations/canvas/canvas-note-artifact";

const DocumentEditor = lazy(() => import("../../integrations/document/DocumentEditor"));
const CanvasEditor = lazy(() => import("../../integrations/canvas/CanvasEditor"));
type FocusRequest = { id: string; request: number } | null;

const editorLoadingClass = "grid flex-1 place-items-center p-10 text-center text-xs text-muted";
const paneMenuButtonClass = "border-0 bg-transparent px-2 py-[7px] text-left text-[10px] text-ink hover:bg-tint hover:text-accent disabled:opacity-50";
const iconActionClass = "grid size-9 shrink-0 place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-tint hover:text-accent";
const popupClass = "absolute z-30 grid w-max min-w-0 max-w-[calc(100vw_-_24px)] max-h-[calc(100dvh_-_80px)] gap-0.5 overflow-y-auto rounded-[7px] border border-line bg-surface p-[5px] shadow-[0_10px_24px_#0002] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0";

function newId() { return crypto.randomUUID(); }

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

export function WorkspacePage({ project, categoryTitle, categoryWorkspaces }: { project: Workspace; categoryTitle: string; categoryWorkspaces: WorkspaceSummary[] }) {
  const { dark } = useTheme();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const compactPanes = useCompactPaneLayout();
  const [normalized] = useState(() => normalizeProjectContent(workspaceContentOf(project)));
  const initial = normalized.content;
  const session = useWorkspaceSession({
    workspaceId: project.id,
    canvasVersion: project.canvasVersion,
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
  const [layout, setLayout] = useState<PaneNode>(() => restoreLayout(`notespace.workspace-layout:${project.id}`, new Set(initial.notes.map((note) => note.id))));
  const [activePaneId, setActivePaneId] = useState(() => leaves(layout)[0]?.id ?? "");
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const [maximizedSplitId, setMaximizedSplitId] = useState<string | null>(null);
  const [selectedTextPaneId, setSelectedTextPaneId] = useState<string | null>(null);
  const [highlightRequest, setHighlightRequest] = useState<{ paneId: string; request: number } | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null);
  const [canvasFocus, setCanvasFocus] = useState<FocusRequest>(null);
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [renamingNote, setRenamingNote] = useState<{ paneId: string; noteId: string } | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [workspaceTitle, setWorkspaceTitle] = useState(project.title);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState(project.title);
  const [workspaceRenamePending, setWorkspaceRenamePending] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const noteRenameInput = useRef<HTMLInputElement>(null);
  const workspaceRenameInput = useRef<HTMLInputElement>(null);
  const workspaceRenameSubmitting = useRef(false);
  const navigationRequest = useRef(0);
  useExclusivePopup(!!deletingNote, () => setDeletingNote(null));
  const study = useActivityRuntime();
  const { adoptLegacyWorkspace } = study;
  const currentWorkspaceTitle = current.current.title;

  useEffect(() => {
    adoptLegacyWorkspace({
      title: currentWorkspaceTitle,
      activityType: "learn",
      workspaceId: project.id,
      workspaceTitleSnapshot: currentWorkspaceTitle,
    });
  }, [adoptLegacyWorkspace, currentWorkspaceTitle, project.id]);
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
    setWorkspaceTitle(project.title);
    setWorkspaceTitleDraft(project.title);
    setRenamingWorkspace(false);
    setPlanOpen(false);
  }, [project.id, project.title]);
  useEffect(() => {
    const keepPaneMenuClicksLocal = (event: MouseEvent) => {
      if ((event.target as Element).closest(".pane-actions > summary, .pane-note-switcher > summary, .workspace-switcher > summary")) event.stopPropagation();
    };
    document.addEventListener("mousedown", keepPaneMenuClicksLocal, true);
    return () => document.removeEventListener("mousedown", keepPaneMenuClicksLocal, true);
  }, []);
  useEffect(() => { writeLocalStorage(`notespace.workspace-layout:${project.id}`, JSON.stringify(layout)); }, [layout, project.id]);
  useEffect(() => { if (renamingNote) { noteRenameInput.current?.focus(); noteRenameInput.current?.select(); } }, [renamingNote]);
  useEffect(() => { if (renamingWorkspace) { workspaceRenameInput.current?.focus(); workspaceRenameInput.current?.select(); } }, [renamingWorkspace]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (maximizedPaneId || maximizedSplitId)) { setMaximizedPaneId(null); setMaximizedSplitId(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximizedPaneId, maximizedSplitId]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const noteId = params.get("note");
    const blockId = params.get("block");
    if (noteId) {
      const pane = leaves(layout).find((item) => item.kind === "note" && item.noteId === noteId);
      if (pane) setActivePaneId(pane.id);
    }
    if (blockId) setDocumentFocus({ id: blockId, request: ++navigationRequest.current });
  }, [layout, project.id]);
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

  const updateDocument = useCallback((paneId: string, document: Snapshot) => {
    const pane = findPane(layout, paneId);
    if (!pane?.noteId) return;
    updateNoteDocument(pane.noteId, document);
  }, [layout, updateNoteDocument]);
  const interactionState = () => paneInteractionState(layout, current.current.notes.map((note) => note.id));

  function splitPane(paneId: string, direction: "row" | "column") {
    const interaction = interactionState();
    if (!interaction.canSplitNote || !interaction.nextUnopenedNoteId) return;
    const source = findPane(layout, paneId);
    if (!source || source.kind === "canvas") return;
    const unused = current.current.notes.find((note) => note.id === interaction.nextUnopenedNoteId);
    if (!unused) return;
    const next: PaneNode = { kind: "leaf", pane: { id: newId(), kind: "note", noteId: unused.id } };
    setLayout((value) => mapNode(value, paneId, (node) => ({ kind: "split", id: newId(), direction, ratio: .5, first: node, second: next })));
    setActivePaneId(next.pane.id);
  }
  function maximizePane(paneId: string) { setMaximizedSplitId(null); setMaximizedPaneId(paneId); }
  function maximizeSplit(splitId: string) { setMaximizedPaneId(null); setMaximizedSplitId(splitId); }
  function switchPaneNote(paneId: string, noteId: string) {
    const duplicate = leaves(layout).find((pane) => pane.kind === "note" && pane.noteId === noteId && pane.id !== paneId);
    if (duplicate) { setActivePaneId(duplicate.id); return; }
    setLayout((value) => mapNode(value, paneId, (node) => node.kind === "leaf" ? { ...node, pane: { ...node.pane, kind: "note", noteId } } : node));
    setActivePaneId(paneId);
    setSelectedTextPaneId(null);
    setHighlightRequest(null);
  }
  function closePane(paneId: string) {
    if (leaves(layout).length <= 1) return;
    const next = removeNode(layout, paneId);
    const remaining = leaves(next);
    setLayout(next);
    setActivePaneId((currentActivePaneId) => remaining.some((pane) => pane.id === currentActivePaneId) ? currentActivePaneId : (remaining[0]?.id ?? ""));
    if (maximizedPaneId === paneId) setMaximizedPaneId(null);
    if (maximizedSplitId && !findSplit(next, maximizedSplitId)) setMaximizedSplitId(null);
    setSelectedTextPaneId((selectedPaneId) => selectedPaneId === paneId ? null : selectedPaneId);
    setHighlightRequest((request) => request?.paneId === paneId ? null : request);
  }
  async function createNote(paneId: string) {
    const id = newId();
    const document = blankDocument();
    try {
      const note = await createWorkspaceNote(project.id, { id, title: "Untitled", document });
      current.current = {
        ...current.current,
        notes: [...current.current.notes, note],
        document: note.document,
      };
      touchContent();
      switchPaneNote(paneId, note.id);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not create note." });
    }
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
      const renamed = await renameWorkspace(project.id, value);
      setWorkspaceTitle(renamed.title);
      setWorkspaceTitleDraft(renamed.title);
      setRenamingWorkspace(false);
      showToast({ kind: "success", message: "Workspace renamed." });
    } catch (error) {
      showToast({ kind: "error", message: workspaceMutationError(error, "Could not rename workspace.") });
    } finally {
      workspaceRenameSubmitting.current = false;
      setWorkspaceRenamePending(false);
    }
  }
  function commitRenameNote(pane: Pane) {
    const value = noteTitle.trim();
    const noteId = renamingNote?.paneId === pane.id ? renamingNote.noteId : pane.noteId;
    if (!noteId || !value) { setRenamingNote(null); return; }
    const existing = current.current.notes.find((note) => note.id === noteId);
    if (!existing) { setRenamingNote(null); return; }
    const nextNote: Note = { ...existing, title: value, updatedAt: new Date().toISOString() };
    current.current = {
      ...current.current,
      notes: current.current.notes.map((note) => note.id === noteId ? nextNote : note),
    };
    touchContent();
    scheduleNote(nextNote);
    setRenamingNote(null);
  }
  function highlightSelectedText() {
    if (!selectedTextPaneId) return;
    setHighlightRequest({ paneId: selectedTextPaneId, request: ++navigationRequest.current });
  }
  async function removeNote() {
    if (!deletingNote || current.current.notes.length <= 1) return;
    try {
      await flushNote(deletingNote.id);
      const persisted = current.current.notes.find((note) => note.id === deletingNote.id);
      if (!persisted) return;
      await deleteWorkspaceNote(project.id, persisted.id, persisted.version);
      const notes = current.current.notes.filter((note) => note.id !== persisted.id);
      const target = leaves(layout).find((pane) => pane.noteId === persisted.id);
      const replacement = notes[0];
      current.current = { ...current.current, notes, document: replacement.document };
      forgetNote(persisted.id);
      touchContent();
      if (target) switchPaneNote(target.id, replacement.id);
      setDeletingNote(null);
    } catch (error) {
      showToast({ kind: "error", message: error instanceof Error ? error.message : "Could not delete note." });
    }
  }
  const focusMode = Boolean(maximizedPaneId || maximizedSplitId);
  const activePane = findPane(layout, activePaneId) ?? leaves(layout)[0];
  const activeFocusTarget = activePane ? paneFocusTarget(layout, activePane.id) : undefined;
  const maximizeLabel = focusMode ? "Restore layout" : activeFocusTarget?.kind === "split" ? "Maximize active split" : "Maximize active pane";
  const workspaceOptions = [{ ...project, title: workspaceTitle }, ...categoryWorkspaces.filter((workspace) => workspace.id !== project.id)];
  const activeViewMode = workspaceViewMode(layout);

  function selectWorkspaceView(mode: WorkspaceViewMode) {
    setPlanOpen(false);
    const preferredNoteId = activePane?.kind === "note" ? activePane.noteId : current.current.notes[0]?.id;
    const next = layoutForViewMode(layout, mode, preferredNoteId);
    setLayout(next);
    setActivePaneId(leaves(next).find((pane) => mode === "canvas" ? pane.kind === "canvas" : pane.kind === "note")?.id ?? leaves(next)[0]?.id ?? "");
    setMaximizedPaneId(null);
    setMaximizedSplitId(null);
  }

  function openPlan() {
    setPlanOpen(true);
    setMaximizedPaneId(null);
    setMaximizedSplitId(null);
  }

  function openNoteFromCanvas(noteId: string) {
    const linkedNote = current.current.notes.find((note) => note.id === noteId);
    if (!linkedNote) {
      showToast({ kind: "error", message: "This linked note no longer exists." });
      return;
    }
    setPlanOpen(false);
    const existingNotePane = leaves(layout).find((pane) => pane.kind === "note" && pane.noteId === noteId);
    if (existingNotePane) {
      setActivePaneId(existingNotePane.id);
    } else {
      const reusableNotePane = leaves(layout).find((pane) => pane.kind === "note");
      if (reusableNotePane) {
        switchPaneNote(reusableNotePane.id, noteId);
      } else {
        const next = layoutForViewMode(layout, "split", noteId);
        setLayout(next);
        setActivePaneId(leaves(next).find((pane) => pane.kind === "note" && pane.noteId === noteId)?.id ?? leaves(next)[0]?.id ?? "");
      }
    }
    setMaximizedPaneId(null);
    setMaximizedSplitId(null);
  }

  function openCanvasFrame(frameId: string) {
    setPlanOpen(false);
    const existingCanvasPane = leaves(layout).find((pane) => pane.kind === "canvas");
    if (existingCanvasPane) {
      setActivePaneId(existingCanvasPane.id);
    } else {
      const next = layoutForViewMode(layout, "canvas", current.current.notes[0]?.id);
      setLayout(next);
      setActivePaneId(leaves(next).find((pane) => pane.kind === "canvas")?.id ?? leaves(next)[0]?.id ?? "");
    }
    setMaximizedPaneId(null);
    setMaximizedSplitId(null);
    setCanvasFocus({ id: frameId, request: ++navigationRequest.current });
  }

  function toggleActiveMaximize() {
    if (focusMode) { setMaximizedPaneId(null); setMaximizedSplitId(null); return; }
    if (!activeFocusTarget) return;
    if (activeFocusTarget.kind === "split") { maximizeSplit(activeFocusTarget.id); return; }
    maximizePane(activeFocusTarget.id);
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
    const interaction = interactionState();
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
      <EditorBoundary><Suspense fallback={<EditorLoading label="Opening note…" />}><DocumentEditor key={`${pane.id}:${note.id}`} workspaceId={project.id} initial={note.document} onChange={(document) => updateDocument(pane.id, document)} onDirtyChange={(value) => setPaneSnapshotDirty(pane.id, value)} registerSnapshotFlush={(flush) => registerPaneSnapshotFlush(pane.id, flush)} onBlockSelect={(_, hasTextSelection) => setSelectedTextPaneId(hasTextSelection ? pane.id : null)} highlightRequest={highlightRequest?.paneId === pane.id ? highlightRequest.request : null} focusRequest={documentFocus} toolbarTargetId={toolbarTargetId} articleMode={articleMode} getCanvasSnapshot={() => current.current.canvas} onOpenCanvasFrame={openCanvasFrame} /></Suspense></EditorBoundary>
    ) : (
      <EditorBoundary><Suspense fallback={<EditorLoading label="Opening Canvas…" />}><CanvasEditor workspaceId={project.id} initial={current.current.canvas} onChange={updateCanvas} focusRequest={canvasFocus} dark={dark} notes={current.current.notes} onOpenNote={openNoteFromCanvas} /></Suspense></EditorBoundary>
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
        <div className={cn("relative z-5 grid place-items-center bg-transparent after:absolute after:top-1/2 after:left-1/2 after:h-[14px] after:w-[3px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[color-mix(in_srgb,var(--line)_72%,transparent)] after:opacity-80 after:content-[''] hover:after:h-[18px] hover:after:w-1 hover:after:bg-accent focus-visible:after:h-[18px] focus-visible:after:w-1 focus-visible:after:bg-accent", direction === "row" ? "cursor-col-resize" : "cursor-row-resize after:h-[3px] after:w-[14px] hover:after:h-[3px] hover:after:w-[18px] focus-visible:after:h-[3px] focus-visible:after:w-[18px]")} role="separator" tabIndex={0} aria-label={`Resize ${direction === "row" ? "horizontal" : "vertical"} panes`} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") setLayout((value) => updateSplit(value, node.id, ratio - .05)); if (event.key === "ArrowRight" || event.key === "ArrowDown") setLayout((value) => updateSplit(value, node.id, ratio + .05)); }} onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = direction === "row" ? event.clientX : event.clientY;
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          if (!bounds) return;
          const size = direction === "row" ? bounds.width : bounds.height;
          const move = (moveEvent: PointerEvent) => { const position = direction === "row" ? moveEvent.clientX : moveEvent.clientY; setLayout((value) => updateSplit(value, node.id, ratio + (position - start) / size)); };
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
  const visible = planOpen ? (
    <WorkspacePlan
      workspaceId={project.id}
      refreshKey={study.taskRevision}
      activityBusy={study.status !== "idle" || !study.canStart}
      onStartActivity={(task, activityType) => {
        study.start({
          title: task.title,
          activityType,
          taskId: task.id,
          taskTitleSnapshot: task.title,
          workspaceId: project.id,
          workspaceTitleSnapshot: current.current.title,
        });
      }}
    />
  ) : authoringVisible;
  const saveFailed = status.state === "error" || status.state === "conflict";
  const saveLabel = status.state === "saved" ? "Saved" : status.state === "saving" ? "Saving…" : status.state === "conflict" ? "Conflict" : status.state === "error" ? "Not saved" : "Unsaved";

  return (
    <div className="h-dvh min-w-0 overflow-hidden">
      <main className={cn("workspace-main flex h-dvh min-h-0 min-w-0 flex-col [--workspace-header-height:44px] max-[560px]:[--workspace-header-height:76px]", focusMode && "is-focus-mode")}>
        <header className={cn("workspace-header relative flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3 max-[800px]:px-2 max-[560px]:grid max-[560px]:min-h-[76px] max-[560px]:grid-cols-[minmax(0,1fr)_auto] max-[560px]:grid-rows-[30px_32px] max-[560px]:items-center max-[560px]:gap-x-2 max-[560px]:gap-y-1 max-[560px]:px-2 max-[560px]:py-1.5", focusMode && "hidden")}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 max-[560px]:order-none max-[560px]:col-span-2 max-[560px]:col-start-1 max-[560px]:row-start-1 max-[560px]:w-full max-[560px]:gap-1">
            <Link to="/" className={iconActionClass} aria-label="Back to library" title="Back to library"><ArrowLeft size={24} /></Link>
            <span className="max-w-[24vw] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted max-[760px]:hidden">{categoryTitle} /</span>
            <div className="flex min-w-0 max-w-[min(32vw,360px)] flex-1 items-center gap-0.5 max-[800px]:w-[34vw] max-[800px]:max-w-[34vw] max-[560px]:min-w-0 max-[560px]:w-auto max-[560px]:max-w-none max-[560px]:flex-1">
              <ContextMenu>
                {renamingWorkspace ? (
                  <WorkspaceRenameField inputRef={workspaceRenameInput} value={workspaceTitleDraft} disabled={workspaceRenamePending} onChange={setWorkspaceTitleDraft} onCommit={commitRenameWorkspace} onCancel={cancelRenameWorkspace} />
                ) : (
                  <details className="workspace-switcher relative min-w-0 flex-1 [&>summary::-webkit-details-marker]:hidden">
                    <ContextMenuTrigger asChild>
                      <summary className="flex h-7 min-w-0 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-accent" aria-label="Switch workspace" onDoubleClick={(event) => { event.preventDefault(); beginRenameWorkspace(); }}>
                        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{workspaceTitle}</span>
                        <ChevronDown size={13} className="shrink-0 text-muted" aria-hidden="true" />
                      </summary>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={beginRenameWorkspace}><Pencil size={13} /> Rename workspace</ContextMenuItem>
                    </ContextMenuContent>
                    <div className={cn(popupClass, "top-7 left-0")} role="listbox" aria-label="Workspaces in this category">
                      {workspaceOptions.map((workspace) => (
                        <Button
                          key={workspace.id}
                          variant="ghost"
                          size="sm"
                          className={cn("!min-h-0 w-full justify-start whitespace-nowrap", paneMenuButtonClass, workspace.id === project.id && "bg-tint text-accent")}
                          role="option"
                          aria-selected={workspace.id === project.id}
                          onClick={(event) => {
                            const details = event.currentTarget.closest("details");
                            if (details) details.open = false;
                            if (workspace.id !== project.id) void navigate({ to: "/workspaces/$workspaceId", params: { workspaceId: workspace.id } });
                          }}
                        >
                          {workspace.title}
                        </Button>
                      ))}
                    </div>
                  </details>
                )}
              </ContextMenu>
            </div>
          </div>
          <WorkspaceViewSwitcher activeViewMode={activeViewMode} planActive={planOpen} onSelect={selectWorkspaceView} onPlanSelect={openPlan} />
          <div className="flex items-center gap-1 max-[760px]:gap-0.5 max-[560px]:order-none max-[560px]:col-start-2 max-[560px]:row-start-2 max-[560px]:w-auto max-[560px]:justify-self-end max-[560px]:overflow-visible max-[560px]:pb-0 max-[560px]:[&>*]:shrink-0">
            <StudyIndicator
              study={study}
              workspaceId={project.id}
              workspaceTitle={current.current.title}
            />
            <span className={cn("flex items-center gap-1 whitespace-nowrap text-[10px] text-muted max-[800px]:gap-0 max-[800px]:text-[0px]", saveFailed && "text-danger", status.state === "saved" && "[&_svg]:text-success")} role="status" aria-live="polite">{status.state === "saved" ? <Check size={20} /> : status.state === "saving" ? <Loader2 size={20} className="animate-spin" /> : <Circle size={10} />}{saveLabel}</span>
            {!planOpen && <IconButton type="button" className={iconActionClass} onClick={toggleActiveMaximize} aria-label={maximizeLabel} title={maximizeLabel}><Maximize2 size={24} /></IconButton>}
            <WorkspaceGuide />
          </div>
        </header>
        <div className={cn("flex h-auto min-h-0 flex-1 overflow-hidden p-3 max-[760px]:p-[7px]", focusMode && "p-0")}>{visible}</div>
      </main>
      <Dialog open={!!deletingNote} onOpenChange={(open) => { if (!open) setDeletingNote(null); }}>
        <DialogContent><DialogTitle>Delete this note?</DialogTitle><DialogDescription>“{deletingNote?.title}” will be removed from this workspace.</DialogDescription><DialogFooter><DialogClose asChild><Button variant="secondary">Keep note</Button></DialogClose><Button variant="danger" onClick={removeNote}>Delete note</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
