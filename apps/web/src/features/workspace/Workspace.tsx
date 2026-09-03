import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Circle,
  FileText,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  Unlink,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ThemeToggle, useTheme } from "../../app/theme";
import { contentOf } from "../../domain/project/project";
import type {
  Note,
  Project,
  ProjectContent,
  ProjectReference,
  ProjectSummary,
  Snapshot,
} from "../../domain/project/project";
import { saveProject } from "../../domain/project/api";
import { Autosave } from "../../domain/project/autosave";
import type { SaveStatus } from "../../domain/project/autosave";
import { StudyIndicator } from "../study/StudyIndicator";
import { useStudySession } from "../study/use-study-session";

const DocumentEditor = lazy(() => import("../../integrations/document/DocumentEditor"));
const CanvasEditor = lazy(() => import("../../integrations/canvas/CanvasEditor"));

type FocusRequest = { id: string; request: number } | null;
type BrokenReference = { referenceId: string; message: string } | null;
type ViewMode = "split" | "note" | "canvas";

function documentHasBlock(snapshot: Snapshot, blockId: string) {
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const attrs = record.attrs;
    if (attrs && typeof attrs === "object" && (attrs as Record<string, unknown>).blockId === blockId) return true;
    return Object.values(record).some(visit);
  };
  return visit(snapshot.data);
}

function documentBlockIds(snapshot: Snapshot) {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const attrs = record.attrs;
    const blockId = attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>).blockId : undefined;
    if (typeof blockId === "string") ids.add(blockId);
    Object.values(record).forEach(visit);
  };
  visit(snapshot.data);
  return ids;
}

function canvasHasElement(snapshot: Snapshot, elementId: string) {
  const elements = snapshot.data.elements;
  if (!Array.isArray(elements)) return false;
  return elements.some((value) => {
    if (!value || typeof value !== "object") return false;
    const element = value as Record<string, unknown>;
    return element.id === elementId && element.isDeleted !== true;
  });
}

function blankDocument(): Snapshot {
  return { format: "tiptap", version: 1, data: { type: "doc", content: [{ type: "paragraph" }] } };
}

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div className="editor-loading" role="alert">This editor could not open. Your stored content is preserved. Reload to retry.</div>
    ) : this.props.children;
  }
}

export function Workspace({
  project,
  workspaces,
  categoryTitle,
}: {
  project: Project;
  workspaces: ProjectSummary[];
  categoryTitle: string;
}) {
  const { dark } = useTheme();
  const initialContent = contentOf(project);
  const current = useRef<ProjectContent>(initialContent);
  const [ratio, setRatio] = useState(project.splitRatio);
  const [references, setReferences] = useState(project.references);
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null);
  const [canvasFocus, setCanvasFocus] = useState<FocusRequest>(null);
  const [brokenReference, setBrokenReference] = useState<BrokenReference>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [focusMode, setFocusMode] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState(initialContent.notes[0]?.id ?? `${project.id}-default`);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(project.title);
  const renameInput = useRef<HTMLInputElement>(null);
  const noteRenameInput = useRef<HTMLInputElement>(null);
  const noteRenameCancelled = useRef(false);
  const navigationRequest = useRef(0);
  const [saver] = useState(() => new Autosave(project.version, (value: ProjectContent, version) => saveProject(project.id, value, version)));
  const split = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const activeNote = current.current.notes.find((note) => note.id === activeNoteId) ?? current.current.notes[0];
  const study = useStudySession(project.id, current.current.title);

  useEffect(() => saver.subscribe(setStatus), [saver]);
  useEffect(() => {
    if (renaming) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming]);
  useEffect(() => {
    if (renamingNoteId) {
      noteRenameInput.current?.focus();
      noteRenameInput.current?.select();
    }
  }, [renamingNoteId]);
  useEffect(() => {
    if (!noteMenuOpen && !workspaceMenuOpen) return;
    const closeMenus = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".workspace-menu, .note-switcher")) return;
      setNoteMenuOpen(false);
      setWorkspaceMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, [noteMenuOpen, workspaceMenuOpen]);
  useEffect(() => {
    if (!focusMode) return;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    document.addEventListener("keydown", exitOnEscape);
    return () => document.removeEventListener("keydown", exitOnEscape);
  }, [focusMode]);
  useBlocker({
    shouldBlockFn: async () => {
      try { await saver.flush(); return false; } catch { return true; }
    },
    enableBeforeUnload: () => saver.dirty,
  });
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") void saver.flush().catch(() => {}); };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      void saver.flush().catch(() => {});
    };
  }, [saver]);

  const update = useCallback((patch: Partial<ProjectContent>) => {
    current.current = { ...current.current, ...patch };
    if (patch.references !== undefined) setReferences(patch.references);
    saver.schedule(current.current);
  }, [saver]);

  const updateDocument = useCallback((document: Snapshot) => {
    const now = new Date().toISOString();
    const notes = current.current.notes.map((note) => note.id === activeNoteId ? { ...note, document, updatedAt: now } : note);
    update({ document, notes });
  }, [activeNoteId, update]);

  const updateCanvas = useCallback((canvas: Snapshot) => update({ canvas }), [update]);

  function selectNote(note: Note) {
    current.current = { ...current.current, document: note.document };
    setActiveNoteId(note.id);
    setSelectedBlockId(null);
    setNoteMenuOpen(false);
  }

  const createNote = useCallback(() => {
    const now = new Date().toISOString();
    const note: Note = { id: crypto.randomUUID(), title: "Untitled", document: blankDocument(), createdAt: now, updatedAt: now };
    update({ notes: [...current.current.notes, note], document: note.document });
    setActiveNoteId(note.id);
    setNoteMenuOpen(false);
  }, [update]);

  function beginNoteRename() {
    if (!activeNote) return;
    noteRenameCancelled.current = false;
    setNoteTitle(activeNote.title);
    setNoteMenuOpen(false);
    setRenamingNoteId(activeNote.id);
  }

  function cancelNoteRename() {
    noteRenameCancelled.current = true;
    setNoteTitle(activeNote?.title ?? "Untitled");
    setRenamingNoteId(null);
  }

  function commitNoteRename() {
    if (noteRenameCancelled.current) {
      noteRenameCancelled.current = false;
      return;
    }
    if (!renamingNoteId) return;
    const next = noteTitle.trim();
    if (!next) {
      cancelNoteRename();
      return;
    }
    const currentNote = current.current.notes.find((note) => note.id === renamingNoteId);
    if (currentNote && next !== currentNote.title) {
      const now = new Date().toISOString();
      update({ notes: current.current.notes.map((note) => note.id === renamingNoteId ? { ...note, title: next, updatedAt: now } : note) });
    }
    setRenamingNoteId(null);
  }

  function removeNote() {
    if (!deletingNote || current.current.notes.length <= 1) return;
    const notes = current.current.notes.filter((note) => note.id !== deletingNote.id);
    const nextActive = deletingNote.id === activeNoteId
      ? notes[0]
      : notes.find((note) => note.id === activeNoteId) ?? notes[0];
    if (!nextActive) return;
    const deletedBlockIds = documentBlockIds(deletingNote.document);
    const references = current.current.references.filter((reference) => !deletedBlockIds.has(reference.blockId));
    const patch: Partial<ProjectContent> = {
      notes,
      references,
    };
    if (deletingNote.id === activeNoteId) patch.document = nextActive.document;
    update(patch);
    setActiveNoteId(nextActive.id);
    setSelectedBlockId(null);
    setDeletingNote(null);
  }

  const createReference = useCallback(() => {
    if (!selectedBlockId || !selectedElementId) return;
    if (current.current.references.some((reference) => reference.blockId === selectedBlockId && reference.elementId === selectedElementId)) return;
    update({ references: [...current.current.references, { id: crypto.randomUUID(), blockId: selectedBlockId, elementId: selectedElementId }] });
    setBrokenReference(null);
  }, [selectedBlockId, selectedElementId, update]);

  const blockReference = selectedBlockId ? references.find((reference) => reference.blockId === selectedBlockId) : undefined;
  const elementReference = selectedElementId ? references.find((reference) => reference.elementId === selectedElementId) : undefined;

  function navigateToCanvas(reference: ProjectReference) {
    if (!canvasHasElement(current.current.canvas, reference.elementId)) {
      setBrokenReference({ referenceId: reference.id, message: "Linked canvas object no longer exists. The reference was kept until you remove it explicitly." });
      return;
    }
    setBrokenReference(null);
    setViewMode("split");
    setCanvasFocus({ id: reference.elementId, request: ++navigationRequest.current });
  }

  function navigateToDocument(reference: ProjectReference) {
    if (!documentHasBlock(current.current.document, reference.blockId)) {
      setBrokenReference({ referenceId: reference.id, message: "Linked document block no longer exists. The reference was kept until you remove it explicitly." });
      return;
    }
    setBrokenReference(null);
    setViewMode("split");
    setDocumentFocus({ id: reference.blockId, request: ++navigationRequest.current });
  }

  function removeReference(referenceId: string) {
    update({ references: current.current.references.filter((reference) => reference.id !== referenceId) });
    setBrokenReference(null);
  }

  function resize(value: number) {
    const next = Math.max(0.25, Math.min(0.7, value));
    setRatio(next);
    update({ splitRatio: next });
  }

  function commitRename() {
    const next = renameTitle.trim();
    if (!next) {
      setRenameTitle(current.current.title);
      setRenaming(false);
      return;
    }
    if (next !== current.current.title) update({ title: next });
    setRenaming(false);
  }

  const categoryWorkspaces = workspaces.filter((workspace) => workspace.categoryId === project.categoryId);
  return (
    <div className={focusMode ? "workspace-shell is-focus-mode" : "workspace-shell"}>
      <main className="workspace-main">
        {!focusMode && <header className="topbar workspace-header">
          <div className="workspace-identity">
            <Link to="/" className="icon-button" aria-label="Back to library" title="Back to library"><ArrowLeft size={18} /></Link>
            <span className="header-divider" />
            <div className="workspace-menu">
              <button className="workspace-switcher-trigger" aria-haspopup="menu" aria-expanded={workspaceMenuOpen} onClick={() => setWorkspaceMenuOpen((open) => !open)}>
                <span className="workspace-category">{categoryTitle}</span><ChevronDown size={14} />
              </button>
              {workspaceMenuOpen && <div className="workspace-menu-popover" role="menu">
                <div className="menu-heading">Workspaces</div>
                {categoryWorkspaces.map((workspace) => <Link key={workspace.id} to="/projects/$projectId" params={{ projectId: workspace.id }} role="menuitem" className={workspace.id === project.id ? "menu-item active" : "menu-item"} onClick={() => setWorkspaceMenuOpen(false)}>{workspace.title}{workspace.id === project.id && <Check size={14} />}</Link>)}
                <Link to="/" role="menuitem" className="menu-item menu-item-muted" onClick={() => setWorkspaceMenuOpen(false)}><Plus size={14} /> New workspace</Link>
              </div>}
            </div>
            <span className="header-divider" />
            {renaming ? <input ref={renameInput} data-inline-edit="workspace" className="inline-title-input" aria-label="Workspace title" value={renameTitle} maxLength={160} onChange={(event) => setRenameTitle(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitRename(); } if (event.key === "Escape") { setRenameTitle(current.current.title); setRenaming(false); } }} /> : <button className="workspace-title-button" onClick={() => { setRenameTitle(current.current.title); setRenaming(true); }} title="Rename workspace"><span className="workspace-title">{current.current.title}</span><Pencil size={13} /></button>}
          </div>
          <div className="header-actions">
            <div className="view-switcher" role="group" aria-label="Workspace view">
              {(["split", "note", "canvas"] as const).map((mode) => <button key={mode} className={viewMode === mode ? "view-mode active" : "view-mode"} aria-pressed={viewMode === mode} onClick={() => setViewMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}
            </div>
            <button className="icon-button" aria-label="Link selections" title="Link selected document block and canvas object" disabled={!selectedBlockId || !selectedElementId} onClick={createReference}><Link2 size={16} /></button>
            {blockReference && <button className="icon-button" aria-label="Go to linked canvas object" title="Go to linked canvas object" onClick={() => navigateToCanvas(blockReference)}><Layers size={16} /></button>}
            {elementReference && <button className="icon-button" aria-label="Go to linked document block" title="Go to linked document block" onClick={() => navigateToDocument(elementReference)}><FileText size={16} /></button>}
            <StudyIndicator study={study} />
            <span className={`save-status status-${status.state}`} role="status" aria-live="polite">{status.state === "saved" ? <Check size={14} /> : status.state === "saving" ? <Loader2 size={14} className="spin" /> : <Circle size={10} />}{status.state === "saved" ? "Saved" : status.state === "saving" ? "Saving…" : status.state === "error" ? "Not saved" : "Unsaved"}</span>
            <button className="icon-button focus-mode-toggle" aria-label="Enter focus mode" title="Focus mode · hide header" onClick={() => setFocusMode(true)}><Maximize2 size={16} /></button>
            <ThemeToggle />
          </div>
        </header>}
        {focusMode && <button className="focus-mode-restore" aria-label="Show workspace header" title="Show workspace header · Escape" onClick={() => setFocusMode(false)}><Minimize2 size={14} /> <span>Show header</span></button>}
        {status.state === "error" && <div className="save-error" role="alert"><span>{status.message}</span><button className="secondary" onClick={() => void saver.flush().catch(() => {})}><RotateCw size={14} /> Retry save</button></div>}
        {brokenReference && <div className="save-error" role="alert"><span>{brokenReference.message}</span><button className="secondary" onClick={() => removeReference(brokenReference.referenceId)}><Unlink size={14} /> Remove broken link</button></div>}
        <div className={`workspace-split workspace-mode-${viewMode}`} ref={split} style={viewMode === "split" ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` } : undefined}>
          {viewMode !== "canvas" && <section className="document-pane" aria-label="Document pane">
            <div className="note-strip">
              {renamingNoteId === activeNote?.id ? <input ref={noteRenameInput} data-inline-edit="note" className="inline-note-title-input" aria-label="Note title" value={noteTitle} maxLength={160} onChange={(event) => setNoteTitle(event.target.value)} onBlur={commitNoteRename} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitNoteRename(); } if (event.key === "Escape") cancelNoteRename(); }} /> : <div className="note-switcher">
                <button className="note-switcher-trigger" aria-haspopup="listbox" aria-expanded={noteMenuOpen} onClick={() => setNoteMenuOpen((open) => !open)}><FileText size={15} /><span className="note-switcher-label">{activeNote?.title ?? "Untitled"}</span><ChevronDown size={14} /></button>
                {noteMenuOpen && <div className="note-menu-popover" role="listbox" aria-label="Notes in this workspace">
                  {current.current.notes.map((note) => <button key={note.id} role="option" aria-selected={note.id === activeNote?.id} className={note.id === activeNote?.id ? "menu-item active" : "menu-item"} onClick={() => selectNote(note)}>{note.title}</button>)}
                  <button className="menu-item menu-item-muted" onClick={createNote}><Plus size={14} /> New note</button>
                  <button className="menu-item" onClick={beginNoteRename}><Pencil size={14} /> Rename note</button>
                  <button className="menu-item menu-item-danger" disabled={current.current.notes.length <= 1} title={current.current.notes.length <= 1 ? "A workspace needs one note" : "Delete note"} onClick={() => { if (activeNote && current.current.notes.length > 1) { setNoteMenuOpen(false); setDeletingNote(activeNote); } }}><Trash2 size={14} /> Delete note</button>
                </div>}
              </div>}
              <div className="note-strip-actions">
                {renamingNoteId !== activeNote?.id && <button className="icon-button" aria-label="Rename note" title="Rename note" onClick={beginNoteRename}><Pencil size={15} /></button>}
                <button className="icon-button" aria-label="New note" title="New note" onClick={createNote}><Plus size={16} /></button>
              </div>
            </div>
            <EditorBoundary><Suspense fallback={<div className="editor-loading">Opening document…</div>}><DocumentEditor key={activeNote?.id} initial={activeNote?.document ?? current.current.document} onChange={updateDocument} onBlockSelect={setSelectedBlockId} focusRequest={documentFocus} /></Suspense></EditorBoundary>
          </section>}
          {viewMode === "split" && <div role="separator" tabIndex={0} aria-label="Resize document and canvas" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={70} aria-valuenow={Math.round(ratio * 100)} className="splitter" onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resize(ratio + (event.key === "ArrowLeft" ? -0.025 : 0.025)); } if (event.key === "Home") { event.preventDefault(); resize(0.45); } }} onPointerDown={(event) => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (dragging.current && split.current) { const bounds = split.current.getBoundingClientRect(); resize((event.clientX - bounds.left) / bounds.width); } }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }} onDoubleClick={() => resize(0.45)}><span /></div>}
          {viewMode !== "note" && <section className="canvas-pane" aria-label="Canvas pane"><EditorBoundary><Suspense fallback={<div className="editor-loading">Opening canvas…</div>}><CanvasEditor initial={current.current.canvas} onChange={updateCanvas} onElementSelect={setSelectedElementId} focusRequest={canvasFocus} dark={dark} /></Suspense></EditorBoundary></section>}
        </div>
      </main>
      <Dialog.Root open={!!deletingNote} onOpenChange={(open) => { if (!open) setDeletingNote(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>Delete this note?</Dialog.Title><Dialog.Description>“{deletingNote?.title}” will be removed from this workspace. Other notes and the canvas will stay.</Dialog.Description><div className="dialog-actions"><Dialog.Close className="secondary">Keep note</Dialog.Close><button className="danger" onClick={removeNote}>Delete note</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}
