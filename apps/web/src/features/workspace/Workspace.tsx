import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronDown, Circle, Download, FileText, Highlighter, History as HistoryIcon, Layers, Loader2, Maximize2, Minimize2, MoreHorizontal, MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, cn } from "../../components/ui";
import { useDismissablePopup, useExclusivePopup } from "../../components/ui/dismissable";
import { ThemeToggle, useTheme } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import { contentOf } from "../../domain/project/project";
import type { Note, Project, ProjectContent, Snapshot } from "../../domain/project/project";
import { exportWorkspace, getHistorySnapshot, listHistory, restoreHistory, saveProject } from "../../domain/project/api";
import type { HistoryEntry, HistorySnapshot } from "../../domain/project/api";
import { Autosave } from "../../domain/project/autosave";
import type { SaveStatus } from "../../domain/project/autosave";
import { StudyIndicator } from "../study/StudyIndicator";
import { useStudySession } from "../study/use-study-session";
import { blankDocument, canvasObjectCount, documentText, normalizeProjectContent } from "./workspace-content";
import { findPane, findSplit, leaves, mapNode, paneFocusTarget, paneInteractionState, removeNode, restoreLayout, updateSplit } from "./pane-layout";
import type { Pane, PaneNode } from "./pane-layout";

const DocumentEditor = lazy(() => import("../../integrations/document/DocumentEditor"));
const CanvasEditor = lazy(() => import("../../integrations/canvas/CanvasEditor"));
type FocusRequest = { id: string; request: number } | null;

const editorLoadingClass = "grid flex-1 place-items-center p-10 text-center text-xs text-muted";
const paneMenuButtonClass = "border-0 bg-transparent px-2 py-[7px] text-left text-[10px] text-ink hover:bg-tint hover:text-accent disabled:opacity-50";
const iconActionClass = "grid size-8 shrink-0 place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-tint hover:text-accent";
const popupClass = "absolute z-30 grid min-w-[165px] max-w-[calc(100vw_-_24px)] max-h-[calc(100dvh_-_80px)] gap-0.5 overflow-y-auto rounded-[7px] border border-line bg-surface p-[5px] shadow-[0_10px_24px_#0002]";

function newId() { return crypto.randomUUID(); }

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className={editorLoadingClass} role="alert">This editor could not open. Your stored content is preserved. Reload to retry.</div> : this.props.children; }
}

export function Workspace({ project, categoryTitle }: { project: Project; categoryTitle: string }) {
  const { dark } = useTheme();
  const { showToast } = useToast();
  const [normalized] = useState(() => normalizeProjectContent(contentOf(project)));
  const initial = normalized.content;
  const current = useRef<ProjectContent>(initial);
  const [layout, setLayout] = useState<PaneNode>(() => restoreLayout(`notespace.workspace-layout:${project.id}`, new Set(initial.notes.map((note) => note.id))));
  const [activePaneId, setActivePaneId] = useState(() => leaves(layout)[0]?.id ?? "");
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null);
  const [maximizedSplitId, setMaximizedSplitId] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
  const [selectedTextPaneId, setSelectedTextPaneId] = useState<string | null>(null);
  const [highlightRequest, setHighlightRequest] = useState<{ paneId: string; request: number } | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyPreview, setHistoryPreview] = useState<HistorySnapshot | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyDrawerRef = useRef<HTMLDivElement>(null);
  const dismissHistory = useCallback(() => setHistoryOpen(false), []);
  useDismissablePopup(historyDrawerRef, historyOpen, dismissHistory);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(project.title);
  const renameInput = useRef<HTMLInputElement>(null);
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [renamingNote, setRenamingNote] = useState<{ paneId: string; noteId: string } | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const noteRenameInput = useRef<HTMLInputElement>(null);
  const navigationRequest = useRef(0);
  useExclusivePopup(!!deletingNote, () => setDeletingNote(null));
  const [saver] = useState(() => new Autosave(project.version, (value: ProjectContent, version) => saveProject(project.id, value, version)));
  const study = useStudySession(project.id, current.current.title);

  useEffect(() => { if (normalized.changed) saver.schedule(current.current); }, [normalized.changed, saver]);
  useEffect(() => saver.subscribe(setStatus), [saver]);
  useEffect(() => {
    if (status.state === "error") {
      showToast({ kind: "error", message: status.message ?? "Save failed. Please retry.", action: { label: "Retry save", onClick: () => void saver.flush().catch(() => {}) } });
    }
    if (status.state === "conflict") {
      showToast({ kind: "error", message: status.message ?? "Workspace changed elsewhere.", action: { label: "Reload latest", onClick: () => window.location.reload() } });
    }
  }, [saver, showToast, status]);
  useEffect(() => {
    const keepPaneMenuClicksLocal = (event: MouseEvent) => {
      if ((event.target as Element).closest(".pane-actions > summary, .pane-note-switcher > summary")) event.stopPropagation();
    };
    document.addEventListener("mousedown", keepPaneMenuClicksLocal, true);
    return () => document.removeEventListener("mousedown", keepPaneMenuClicksLocal, true);
  }, []);
  useEffect(() => { localStorage.setItem(`notespace.workspace-layout:${project.id}`, JSON.stringify(layout)); }, [layout, project.id]);
  useEffect(() => { if (renaming) { renameInput.current?.focus(); renameInput.current?.select(); } }, [renaming]);
  useEffect(() => { if (renamingNote) { noteRenameInput.current?.focus(); noteRenameInput.current?.select(); } }, [renamingNote]);
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
  useBlocker({ shouldBlockFn: async () => { try { await saver.flush(); return false; } catch { return true; } }, enableBeforeUnload: () => saver.dirty });
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") void saver.flush().catch(() => {}); };
    document.addEventListener("visibilitychange", flush);
    return () => { document.removeEventListener("visibilitychange", flush); void saver.flush().catch(() => {}); };
  }, [saver]);

  const update = useCallback((patch: Partial<ProjectContent>) => {
    current.current = { ...current.current, ...patch };
    saver.schedule(current.current);
  }, [saver]);
  const updateDocument = useCallback((paneId: string, document: Snapshot) => {
    const pane = findPane(layout, paneId);
    if (!pane?.noteId) return;
    const now = new Date().toISOString();
    const notes = current.current.notes.map((note) => note.id === pane.noteId ? { ...note, document, updatedAt: now } : note);
    update({ document, notes });
  }, [layout, update]);
  const updateCanvas = useCallback((canvas: Snapshot) => update({ canvas }), [update]);
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
  function addCanvasPane(paneId: string) {
    if (!interactionState().canOpenCanvas) return;
    const next: PaneNode = { kind: "leaf", pane: { id: newId(), kind: "canvas" } };
    setLayout((value) => mapNode(value, paneId, (node) => ({ kind: "split", id: newId(), direction: "row", ratio: .5, first: node, second: next })));
    setActivePaneId(next.pane.id);
  }
  function openNotePane(paneId: string) {
    const interaction = interactionState();
    if (!interaction.canOpenNote || !interaction.nextUnopenedNoteId) return;
    const next: PaneNode = { kind: "leaf", pane: { id: newId(), kind: "note", noteId: interaction.nextUnopenedNoteId } };
    setLayout((value) => mapNode(value, paneId, (node) => ({ kind: "split", id: newId(), direction: "row", ratio: .5, first: node, second: next })));
    setActivePaneId(next.pane.id);
  }
  function closePane(paneId: string) {
    if (!interactionState().canClosePane) return;
    const next = removeNode(layout, paneId);
    setLayout(next);
    if (activePaneId === paneId) setActivePaneId(leaves(next)[0]?.id ?? "");
    if (maximizedPaneId === paneId) setMaximizedPaneId(null);
    if (maximizedSplitId && !findSplit(next, maximizedSplitId)) setMaximizedSplitId(null);
  }
  function maximizePane(paneId: string) { setMaximizedSplitId(null); setMaximizedPaneId(paneId); }
  function maximizeSplit(splitId: string) { setMaximizedPaneId(null); setMaximizedSplitId(splitId); }
  function switchPaneNote(paneId: string, noteId: string) {
    const duplicate = leaves(layout).find((pane) => pane.kind === "note" && pane.noteId === noteId && pane.id !== paneId);
    if (duplicate) { setActivePaneId(duplicate.id); return; }
    setLayout((value) => mapNode(value, paneId, (node) => node.kind === "leaf" ? { ...node, pane: { ...node.pane, kind: "note", noteId } } : node));
    setActivePaneId(paneId);
  }
  function createNote(paneId: string) {
    const now = new Date().toISOString();
    const note: Note = { id: newId(), title: "Untitled", document: blankDocument(), createdAt: now, updatedAt: now };
    update({ notes: [...current.current.notes, note], document: note.document });
    switchPaneNote(paneId, note.id);
  }
  function beginRenameNote(pane: Pane, noteId = pane.noteId) {
    if (!noteId) return;
    const note = current.current.notes.find((item) => item.id === noteId);
    if (!note) return;
    setNoteTitle(note.title);
    setRenamingNote({ paneId: pane.id, noteId });
  }
  function commitRenameNote(pane: Pane) {
    const value = noteTitle.trim();
    const noteId = renamingNote?.paneId === pane.id ? renamingNote.noteId : pane.noteId;
    if (!noteId || !value) { setRenamingNote(null); return; }
    update({ notes: current.current.notes.map((note) => note.id === noteId ? { ...note, title: value, updatedAt: new Date().toISOString() } : note) });
    setRenamingNote(null);
  }
  function highlightSelectedText() {
    if (!selectedTextPaneId) return;
    setHighlightRequest({ paneId: selectedTextPaneId, request: ++navigationRequest.current });
  }
  function removeNote() {
    if (!deletingNote || current.current.notes.length <= 1) return;
    const notes = current.current.notes.filter((note) => note.id !== deletingNote.id);
    const target = leaves(layout).find((pane) => pane.noteId === deletingNote.id);
    const replacement = notes[0];
    update({ notes, document: replacement.document });
    if (target) switchPaneNote(target.id, replacement.id);
    setDeletingNote(null);
  }
  async function openHistory() { setHistoryOpen((value) => !value); if (!historyEntries.length) { try { setHistoryEntries(await listHistory(project.id)); } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load history." }); } } }
  async function previewHistory(entry: HistoryEntry) { try { setHistoryPreview(await getHistorySnapshot(project.id, entry.id)); } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load checkpoint." }); } }
  async function restoreSelectedHistory() { if (!historyPreview) return; try { await saver.flush(); await restoreHistory(project.id, historyPreview.id); window.location.reload(); } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not restore checkpoint." }); } }
  function renameWorkspace() { const value = renameTitle.trim(); if (value && value !== current.current.title) update({ title: value }); setRenaming(false); }

  const focusMode = Boolean(maximizedPaneId || maximizedSplitId);
  const activePane = findPane(layout, activePaneId) ?? leaves(layout)[0];
  const activeFocusTarget = activePane ? paneFocusTarget(layout, activePane.id) : undefined;
  const maximizeLabel = focusMode ? "Restore layout" : activeFocusTarget?.kind === "split" ? "Maximize active split" : "Maximize active pane";

  function toggleActiveMaximize() {
    if (focusMode) { setMaximizedPaneId(null); setMaximizedSplitId(null); return; }
    if (!activeFocusTarget) return;
    if (activeFocusTarget.kind === "split") { maximizeSplit(activeFocusTarget.id); return; }
    maximizePane(activeFocusTarget.id);
  }

  function selectionContext(pane: Pane, content: ReactNode) {
    const textSelection = pane.kind === "note" && selectedTextPaneId === pane.id;
    if (!textSelection) return content;
    return <ContextMenu>
      <ContextMenuTrigger asChild><div className="pane-content-context flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">{content}</div></ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={highlightSelectedText}><Highlighter size={13} /> Highlight text</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>;
  }

  function renderPane(pane: Pane) {
    const note = pane.noteId ? current.current.notes.find((item) => item.id === pane.noteId) : undefined;
    const isActive = pane.id === activePaneId;
    const interaction = interactionState();
    const paneCapacityTitle = interaction.paneLimitReached ? "Maximum 4 panes per workspace." : undefined;
    const noUnusedNoteTitle = !interaction.hasUnopenedNote ? "Create another note before opening another note pane." : undefined;
    const noteHeader = pane.kind === "note" && (
      renamingNote?.paneId === pane.id ? (
        <input ref={noteRenameInput} className="w-[45%] min-w-0 border-0 bg-transparent px-0 py-1 text-[10px] text-ink outline-0" aria-label="Note title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} onBlur={() => commitRenameNote(pane)} onKeyDown={(event) => { if (event.key === "Enter") commitRenameNote(pane); if (event.key === "Escape") setRenamingNote(null); }} />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <details className="pane-note-switcher relative min-w-0 [&>summary::-webkit-details-marker]:hidden">
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 text-[10px] text-ink" onDoubleClick={(event) => { event.preventDefault(); beginRenameNote(pane); }}><FileText size={14} /><span className="max-w-[25vw] overflow-hidden text-ellipsis whitespace-nowrap max-[760px]:max-w-[45vw]">{note?.title ?? "Untitled"}</span><ChevronDown size={13} /></summary>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => beginRenameNote(pane)}><Pencil size={13} /> Rename note</ContextMenuItem>
                <ContextMenuItem disabled={current.current.notes.length <= 1} onSelect={() => { if (note) setDeletingNote(note); }}><Trash2 size={13} /> Delete note</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <div className={cn(popupClass, "top-7 right-auto left-0")} role="listbox" aria-label="Notes in this workspace">
              {current.current.notes.map((item) => <ContextMenu key={item.id}>
                <ContextMenuTrigger asChild>
                  <button className={paneMenuButtonClass} role="option" aria-selected={item.id === pane.noteId} onClick={() => switchPaneNote(pane.id, item.id)} onDoubleClick={(event) => { event.preventDefault(); switchPaneNote(pane.id, item.id); beginRenameNote(pane, item.id); }}>{item.title}</button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => switchPaneNote(pane.id, item.id)}><MoveRight size={13} /> Move to this pane</ContextMenuItem>
                  <ContextMenuItem onSelect={() => { switchPaneNote(pane.id, item.id); beginRenameNote(pane, item.id); }}><Pencil size={13} /> Rename note</ContextMenuItem>
                  <ContextMenuItem disabled={current.current.notes.length <= 1} onSelect={() => setDeletingNote(item)}><Trash2 size={13} /> Delete note</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>)}
            </div>
          </details>
          <button className="grid size-6 shrink-0 place-items-center rounded-[5px] border-0 bg-transparent text-muted hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent" type="button" aria-label="New note" title="New note" onClick={() => createNote(pane.id)}><Plus size={14} /></button>
        </div>
      )
    );
    const toolbarTargetId = `note-pane-toolbar-${pane.id}`;
    const surface = pane.kind === "note" && note ? (
      <EditorBoundary><Suspense fallback={<div className={editorLoadingClass}>Opening note…</div>}><DocumentEditor key={pane.id} workspaceId={project.id} initial={note.document} onChange={(document) => updateDocument(pane.id, document)} onBlockSelect={(_, hasTextSelection) => setSelectedTextPaneId(hasTextSelection ? pane.id : null)} highlightRequest={highlightRequest?.paneId === pane.id ? highlightRequest.request : null} focusRequest={documentFocus} toolbarTargetId={toolbarTargetId} /></Suspense></EditorBoundary>
    ) : (
      <EditorBoundary><Suspense fallback={<div className={editorLoadingClass}>Opening Canvas…</div>}><CanvasEditor workspaceId={project.id} initial={current.current.canvas} onChange={updateCanvas} dark={dark} /></Suspense></EditorBoundary>
    );

    return (
      <section key={pane.id} className={cn("grid h-full min-h-0 min-w-0 w-full grid-rows-[34px_minmax(0,1fr)] overflow-visible bg-surface", isActive && "border-transparent")} onMouseDown={() => setActivePaneId(pane.id)} aria-label={pane.kind === "canvas" ? "Canvas pane" : `${note?.title ?? "Note"} note pane`}>
        <header className="flex min-w-0 items-center justify-between gap-2 border-b border-line pr-2 pl-[11px]">
          {noteHeader ?? <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[10px] text-ink"><Layers size={14} /> Canvas</span>}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {pane.kind === "note" && <div id={toolbarTargetId} className="flex items-center gap-0.5" />}
            {focusMode && isActive && <button type="button" className="grid size-[26px] place-items-center rounded-[5px] border-0 bg-transparent text-muted hover:bg-tint hover:text-accent" onClick={toggleActiveMaximize} aria-label="Restore layout" title="Restore layout"><Minimize2 size={15} /></button>}
            <details className="pane-actions relative min-w-0 [&>summary::-webkit-details-marker]:hidden">
              <summary className="grid size-[26px] cursor-pointer list-none place-items-center text-muted hover:text-ink" aria-label={`Actions for ${pane.kind === "canvas" ? "Canvas" : note?.title ?? "Note"}`}><MoreHorizontal size={17} /></summary>
              <div className={cn(popupClass, "pane-menu top-7 right-0", focusMode && "fixed top-9 right-3 left-auto z-60 min-w-[min(165px,calc(100vw_-_24px))] max-w-[calc(100vw_-_24px)] max-h-[calc(100dvh_-_48px)]")}>
                {pane.kind === "canvas" && <button className={paneMenuButtonClass} disabled={!interaction.canOpenNote} title={paneCapacityTitle ?? noUnusedNoteTitle} onClick={() => openNotePane(pane.id)}>Open note</button>}
                {pane.kind === "note" && <>
                  <button className={paneMenuButtonClass} disabled={!interaction.canOpenCanvas} title={interaction.canvasOpen ? "Canvas is already open." : paneCapacityTitle} onClick={() => addCanvasPane(pane.id)}>Open Canvas</button>
                  <button className={paneMenuButtonClass} disabled={!interaction.canSplitNote} title={paneCapacityTitle ?? noUnusedNoteTitle} onClick={() => splitPane(pane.id, "row")}>Split right</button>
                  <button className={paneMenuButtonClass} disabled={!interaction.canSplitNote} title={paneCapacityTitle ?? noUnusedNoteTitle} onClick={() => splitPane(pane.id, "column")}>Split down</button>
                  <button className={paneMenuButtonClass} disabled={current.current.notes.length <= 1} onClick={() => { if (note) setDeletingNote(note); }}>Delete note</button>
                </>}
                <button className={paneMenuButtonClass} disabled={!interaction.canClosePane} onClick={() => closePane(pane.id)}>Close pane</button>
              </div>
            </details>
          </div>
        </header>
        {selectionContext(pane, surface)}
      </section>
    );
  }

  function renderNode(node: PaneNode): ReactNode {
    if (node.kind === "leaf") return renderPane(node.pane);
    const ratio = node.ratio;
    return (
      <div className={cn("grid h-full min-h-0 min-w-0 w-full gap-0 [&>div]:grid [&>div]:min-h-0 [&>div]:min-w-0", node.direction === "column" && "grid-cols-1", node.direction === "row" && "max-[760px]:!grid-cols-1 max-[760px]:!grid-rows-[minmax(0,1fr)_7px_minmax(0,1fr)]")} key={node.id} style={node.direction === "row" ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` } : { gridTemplateRows: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` }}>
        {renderNode(node.first)}
        <div className={cn("relative z-5 grid place-items-center bg-transparent after:absolute after:top-1/2 after:left-1/2 after:h-[14px] after:w-[3px] after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-[color-mix(in_srgb,var(--line)_72%,transparent)] after:opacity-80 after:content-[''] hover:after:h-[18px] hover:after:w-1 hover:after:bg-accent focus-visible:after:h-[18px] focus-visible:after:w-1 focus-visible:after:bg-accent", node.direction === "row" ? "cursor-col-resize max-[760px]:cursor-row-resize" : "cursor-row-resize after:h-[3px] after:w-[14px] hover:after:h-[3px] hover:after:w-[18px] focus-visible:after:h-[3px] focus-visible:after:w-[18px]")} role="separator" tabIndex={0} aria-label={`Resize ${node.direction === "row" ? "horizontal" : "vertical"} panes`} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") setLayout((value) => updateSplit(value, node.id, ratio - .05)); if (event.key === "ArrowRight" || event.key === "ArrowDown") setLayout((value) => updateSplit(value, node.id, ratio + .05)); }} onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const start = node.direction === "row" ? event.clientX : event.clientY;
          const bounds = event.currentTarget.parentElement?.getBoundingClientRect();
          if (!bounds) return;
          const size = node.direction === "row" ? bounds.width : bounds.height;
          const move = (moveEvent: PointerEvent) => { const position = node.direction === "row" ? moveEvent.clientX : moveEvent.clientY; setLayout((value) => updateSplit(value, node.id, ratio + (position - start) / size)); };
          const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", stop);
        }} />
        <div>{renderNode(node.second)}</div>
      </div>
    );
  }

  const maximizedSplit = maximizedSplitId ? findSplit(layout, maximizedSplitId) : undefined;
  const visible = maximizedPaneId ? (findPane(layout, maximizedPaneId) ? renderPane(findPane(layout, maximizedPaneId)!) : renderNode(layout)) : maximizedSplit ? renderNode(maximizedSplit) : renderNode(layout);
  const saveFailed = status.state === "error" || status.state === "conflict";
  const saveLabel = status.state === "saved" ? "Saved" : status.state === "saving" ? "Saving…" : status.state === "conflict" ? "Conflict" : status.state === "error" ? "Not saved" : "Unsaved";

  return (
    <div className="h-dvh min-w-0">
      <main className={cn("workspace-main flex h-dvh min-h-0 min-w-0 flex-col [--workspace-header-height:62px] max-[560px]:min-h-dvh max-[560px]:[--workspace-header-height:44px]", focusMode && "is-focus-mode")}>
        <header className={cn("workspace-header flex min-h-[62px] shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-[18px] max-[800px]:px-[9px] max-[560px]:min-h-11 max-[560px]:flex-col max-[560px]:items-stretch max-[560px]:justify-center max-[560px]:gap-[5px] max-[560px]:px-4 max-[560px]:py-[7px]", focusMode && "hidden")}>
          <div className="flex min-w-0 flex-1 items-center gap-[9px] max-[560px]:w-full max-[560px]:gap-[3px]">
            <Link to="/" className={iconActionClass} aria-label="Back to library" title="Back to library"><ArrowLeft size={18} /></Link>
            <span className="max-w-[24vw] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-muted max-[760px]:hidden">{categoryTitle} /</span>
            {renaming ? <input ref={renameInput} className="w-[min(32vw,360px)] min-w-[110px] border-0 bg-transparent px-[7px] py-1.5 text-sm text-ink outline-0 max-[800px]:w-[34vw] max-[800px]:max-w-[34vw] max-[560px]:min-w-0 max-[560px]:w-auto max-[560px]:max-w-none max-[560px]:flex-1" aria-label="Workspace title" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} onBlur={renameWorkspace} onKeyDown={(event) => { if (event.key === "Enter") renameWorkspace(); if (event.key === "Escape") setRenaming(false); }} /> : <button className="group inline-flex max-w-[min(32vw,360px)] items-center gap-2 rounded-[7px] border-0 bg-transparent px-[7px] py-[5px] text-left text-ink hover:bg-tint hover:text-accent focus-visible:bg-tint focus-visible:text-accent max-[800px]:w-[34vw] max-[800px]:max-w-[34vw] max-[560px]:min-w-0 max-[560px]:w-auto max-[560px]:max-w-none max-[560px]:flex-1" onClick={() => { setRenameTitle(current.current.title); setRenaming(true); }}><span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">{current.current.title}</span><Pencil size={13} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" /></button>}
          </div>
          <div className="flex items-center gap-2 max-[760px]:gap-1 max-[560px]:w-full max-[560px]:min-w-0 max-[560px]:overflow-x-auto max-[560px]:overscroll-x-contain max-[560px]:pb-px max-[560px]:[scrollbar-width:none] max-[560px]:[&::-webkit-scrollbar]:hidden max-[560px]:[&>*]:shrink-0">
            <StudyIndicator study={study} />
            <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted max-[800px]:gap-0 max-[800px]:text-[0px] max-[560px]:text-[9px]", saveFailed && "text-danger", status.state === "saved" && "[&_svg]:text-success")} role="status" aria-live="polite">{status.state === "saved" ? <Check size={14} /> : status.state === "saving" ? <Loader2 size={14} className="animate-spin" /> : <Circle size={10} />}{saveLabel}</span>
            <details className="relative shrink-0 [&>summary::-webkit-details-marker]:hidden">
              <summary className={cn(iconActionClass, "cursor-pointer list-none")} aria-label="Workspace actions"><MoreHorizontal size={18} /></summary>
              <div className="absolute top-[calc(100%+6px)] right-0 z-20 grid w-max min-w-0 max-w-[calc(100vw_-_24px)] gap-0.5 rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_#0002]">
                <button className="flex min-h-[31px] w-max max-w-[calc(100vw_-_42px)] items-center justify-start gap-2 rounded-[5px] border-0 bg-transparent px-[9px] py-1.5 text-left text-[11px] text-ink hover:bg-tint hover:text-accent" onClick={() => void openHistory()}><HistoryIcon size={14} /> History</button>
                <a className="flex min-h-[31px] w-max max-w-[calc(100vw_-_42px)] items-center justify-start gap-2 rounded-[5px] px-[9px] py-1.5 text-left text-[11px] text-ink hover:bg-tint hover:text-accent" href={exportWorkspace(project.id)} download><Download size={14} /> Export</a>
              </div>
            </details>
            <button type="button" className={iconActionClass} onClick={toggleActiveMaximize} aria-label={maximizeLabel} title={maximizeLabel}><Maximize2 size={17} /></button>
            <ThemeToggle />
          </div>
        </header>
        <div className={cn("flex h-auto min-h-0 flex-1 overflow-hidden p-3 max-[760px]:h-[calc(100dvh_-_58px)] max-[760px]:p-[7px]", focusMode && "p-0")}>{visible}</div>
      </main>
      <Dialog open={!!deletingNote} onOpenChange={(open) => { if (!open) setDeletingNote(null); }}>
        <DialogContent><DialogTitle>Delete this note?</DialogTitle><DialogDescription>“{deletingNote?.title}” will be removed from this workspace.</DialogDescription><DialogFooter><DialogClose asChild><Button variant="secondary">Keep note</Button></DialogClose><Button variant="danger" onClick={removeNote}>Delete note</Button></DialogFooter></DialogContent>
      </Dialog>
      {historyOpen && <div ref={historyDrawerRef} className="fixed top-[60px] right-[15px] z-45 max-h-[calc(100dvh_-_80px)] w-[min(235px,calc(100vw_-_30px))] overflow-auto rounded-lg border border-line bg-surface p-2.5 shadow-[0_14px_32px_#0003]">
        <div className="mb-[7px] flex items-center justify-between gap-2 text-[11px]"><strong>History</strong><button className={iconActionClass} onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button></div>
        {historyEntries.length ? historyEntries.map((entry) => <button key={entry.id} className={cn("grid w-full gap-[3px] rounded-[5px] border-0 bg-transparent p-2 text-left text-[10px] text-ink hover:bg-tint", historyPreview?.id === entry.id && "bg-tint")} onClick={() => void previewHistory(entry)}><span className="text-[9px] text-muted">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · v{entry.version}</span><span>{entry.title}</span></button>) : <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted">No checkpoints yet.</p>}
        {historyPreview && <div className="mt-1.5 grid gap-[5px] border-t border-line px-2 pt-[9px] pb-[3px] text-[10px]"><strong className="text-[10px] font-[550] text-ink">Preview v{historyPreview.version}</strong><span className="overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted">{historyPreview.notes.length} notes · {canvasObjectCount(historyPreview.canvas)} Canvas objects</span><p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-muted">{documentText(historyPreview.document).slice(0, 180) || "Empty document"}</p><button className="border-0 bg-transparent p-[3px] text-left text-[10px] text-muted hover:text-ink focus-visible:text-ink" onClick={() => void restoreSelectedHistory()}>Restore</button></div>}
      </div>}
    </div>
  );
}
