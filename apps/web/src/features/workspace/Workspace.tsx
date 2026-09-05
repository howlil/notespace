import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { ArrowLeft, Check, ChevronDown, Circle, Download, FileText, Highlighter, History as HistoryIcon, Layers, Link2, Loader2, MoreHorizontal, MoveRight, Pencil, Plus, Trash2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "../../components/ui";
import { useDismissablePopup, useExclusivePopup } from "../../components/ui/dismissable";
import { ThemeToggle, useTheme } from "../../providers/theme-provider";
import { useToast } from "../../providers/toast-provider";
import { contentOf } from "../../domain/project/project";
import type { Note, Project, ProjectContent, ProjectReference, Snapshot } from "../../domain/project/project";
import { exportWorkspace, getHistorySnapshot, listHistory, restoreHistory, saveProject } from "../../domain/project/api";
import type { HistoryEntry, HistorySnapshot } from "../../domain/project/api";
import { Autosave } from "../../domain/project/autosave";
import type { SaveStatus } from "../../domain/project/autosave";
import { StudyIndicator } from "../study/StudyIndicator";
import { useStudySession } from "../study/use-study-session";
import "./workspace.css";

const DocumentEditor = lazy(() => import("../../integrations/document/DocumentEditor"));
const CanvasEditor = lazy(() => import("../../integrations/canvas/CanvasEditor"));
type FocusRequest = { id: string; request: number } | null;
type Pane = { id: string; kind: "note" | "canvas"; noteId?: string };
type PaneNode = { kind: "leaf"; pane: Pane } | { kind: "split"; id: string; direction: "row" | "column"; ratio: number; first: PaneNode; second: PaneNode };

function newId() { return crypto.randomUUID(); }
const LINKABLE_BLOCK_TYPES = new Set(["paragraph", "heading", "codeBlock", "listItem", "taskItem"]);
function blankDocument(blockId = newId()): Snapshot { return { format: "tiptap", version: 1, data: { type: "doc", content: [{ type: "paragraph", attrs: { blockId } }] } }; }
function normalizeDocument(snapshot: Snapshot) {
  let changed = false;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    let next = record;
    if (typeof record.type === "string" && LINKABLE_BLOCK_TYPES.has(record.type)) {
      const attrs = record.attrs && typeof record.attrs === "object" ? record.attrs as Record<string, unknown> : {};
      if (typeof attrs.blockId !== "string" || !attrs.blockId) {
        next = { ...next, attrs: { ...attrs, blockId: newId() } };
        changed = true;
      }
    }
    const childContent = next.content;
    if (Array.isArray(childContent)) {
      const content = childContent.map(visit);
      if (content.some((item, index) => item !== childContent[index])) next = { ...next, content };
    }
    return next;
  };
  const data = visit(snapshot.data) as Record<string, unknown>;
  return { snapshot: changed ? { ...snapshot, data } : snapshot, changed };
}
function normalizeProjectContent(content: ProjectContent) {
  const document = normalizeDocument(content.document);
  let changed = document.changed;
  const notes = content.notes.map((note) => {
    const result = normalizeDocument(note.document);
    changed ||= result.changed;
    return result.changed ? { ...note, document: result.snapshot } : note;
  });
  return { content: changed ? { ...content, document: document.snapshot, notes } : content, changed };
}
function documentHasBlock(snapshot: Snapshot, blockId: string) { const visit = (value: unknown): boolean => { if (Array.isArray(value)) return value.some(visit); if (!value || typeof value !== "object") return false; const record = value as Record<string, unknown>; const attrs = record.attrs; if (attrs && typeof attrs === "object" && (attrs as Record<string, unknown>).blockId === blockId) return true; return Object.values(record).some(visit); }; return visit(snapshot.data); }
function documentBlockText(snapshot: Snapshot, blockId: string) { let result = ""; const visit = (value: unknown) => { if (Array.isArray(value)) { value.forEach(visit); return; } if (!value || typeof value !== "object") return; const record = value as Record<string, unknown>; const attrs = record.attrs; if (attrs && typeof attrs === "object" && (attrs as Record<string, unknown>).blockId === blockId) { const collect = (child: unknown) => { if (Array.isArray(child)) { child.forEach(collect); return; } if (!child || typeof child !== "object") return; const item = child as Record<string, unknown>; if (typeof item.text === "string") result += `${item.text} `; collect(item.content); }; collect(record); return; } Object.values(record).forEach(visit); }; visit(snapshot.data); return result.trim(); }
function documentBlocks(snapshot: Snapshot) { const blocks: Array<{ id: string; label: string }> = []; const seen = new Set<string>(); const visit = (value: unknown) => { if (Array.isArray(value)) { value.forEach(visit); return; } if (!value || typeof value !== "object") return; const record = value as Record<string, unknown>; const attrs = record.attrs; const blockId = attrs && typeof attrs === "object" ? (attrs as Record<string, unknown>).blockId : undefined; if (typeof blockId === "string" && !seen.has(blockId)) { seen.add(blockId); blocks.push({ id: blockId, label: documentBlockText(snapshot, blockId).slice(0, 64) || "Empty block" }); } if (record.content) visit(record.content); }; visit(snapshot.data); return blocks; }
function documentText(snapshot: Snapshot) { let result = ""; const visit = (value: unknown) => { if (Array.isArray(value)) { value.forEach(visit); return; } if (!value || typeof value !== "object") return; const record = value as Record<string, unknown>; if (typeof record.text === "string") result += `${record.text} `; if (record.content) visit(record.content); }; visit(snapshot.data); return result.trim(); }
function canvasObjectCount(snapshot: Snapshot) { return Array.isArray(snapshot.data.elements) ? snapshot.data.elements.filter((value) => value && typeof value === "object" && (value as Record<string, unknown>).isDeleted !== true).length : 0; }
function canvasElementText(snapshot: Snapshot, elementId: string) { const elements = snapshot.data.elements; if (!Array.isArray(elements)) return ""; const found = elements.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).id === elementId) as Record<string, unknown> | undefined; if (typeof found?.text === "string") return found.text; const label = elements.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).containerId === elementId && typeof (value as Record<string, unknown>).text === "string") as Record<string, unknown> | undefined; return typeof label?.text === "string" ? label.text : ""; }
function canvasHasElement(snapshot: Snapshot, elementId: string) { return Array.isArray(snapshot.data.elements) && snapshot.data.elements.some((value) => value && typeof value === "object" && (value as Record<string, unknown>).id === elementId && (value as Record<string, unknown>).isDeleted !== true); }
function leafCount(node: PaneNode): number { return node.kind === "leaf" ? 1 : leafCount(node.first) + leafCount(node.second); }
function leaves(node: PaneNode): Pane[] { return node.kind === "leaf" ? [node.pane] : [...leaves(node.first), ...leaves(node.second)]; }
function findPane(node: PaneNode, id: string): Pane | undefined { return node.kind === "leaf" ? node.pane.id === id ? node.pane : undefined : findPane(node.first, id) ?? findPane(node.second, id); }
function findSplit(node: PaneNode, id: string): Extract<PaneNode, { kind: "split" }> | undefined { if (node.kind === "leaf") return undefined; if (node.id === id) return node; return findSplit(node.first, id) ?? findSplit(node.second, id); }
function findContainingSplit(node: PaneNode, paneId: string): Extract<PaneNode, { kind: "split" }> | undefined { if (node.kind === "leaf") return undefined; return findContainingSplit(node.first, paneId) ?? findContainingSplit(node.second, paneId) ?? (leaves(node.first).some((pane) => pane.id === paneId) || leaves(node.second).some((pane) => pane.id === paneId) ? node : undefined); }
function mapNode(node: PaneNode, id: string, transform: (node: PaneNode) => PaneNode): PaneNode { if (node.kind === "leaf") return node.pane.id === id ? transform(node) : node; return { ...node, first: mapNode(node.first, id, transform), second: mapNode(node.second, id, transform) }; }
function updateSplit(node: PaneNode, id: string, ratio: number): PaneNode { if (node.kind === "leaf") return node; if (node.id === id) return { ...node, ratio: Math.max(.2, Math.min(.8, ratio)) }; return { ...node, first: updateSplit(node.first, id, ratio), second: updateSplit(node.second, id, ratio) }; }
function removeNode(node: PaneNode, id: string): PaneNode { if (node.kind === "leaf") return node; if (node.first.kind === "leaf" && node.first.pane.id === id) return node.second; if (node.second.kind === "leaf" && node.second.pane.id === id) return node.first; return { ...node, first: removeNode(node.first, id), second: removeNode(node.second, id) }; }
function defaultLayout(noteId: string): PaneNode { return { kind: "split", id: newId(), direction: "row", ratio: .5, first: { kind: "leaf", pane: { id: newId(), kind: "note", noteId } }, second: { kind: "leaf", pane: { id: newId(), kind: "canvas" } } }; }
function restoreLayout(key: string, noteIds: Set<string>, canvasExists: boolean): PaneNode { try { const stored = JSON.parse(localStorage.getItem(key) ?? "null") as PaneNode | null; const clean = (node: PaneNode): PaneNode | null => { if (!node || (node.kind !== "leaf" && node.kind !== "split")) return null; if (node.kind === "leaf") { if (node.pane.kind === "canvas") { if (!canvasExists) return null; canvasExists = false; return node; } if (node.pane.kind !== "note" || !node.pane.noteId || !noteIds.has(node.pane.noteId)) return null; return node; } const first = clean(node.first); const second = clean(node.second); if (!first) return second; if (!second) return first; return { ...node, ratio: Math.max(.2, Math.min(.8, node.ratio || .5)), first, second }; }; const result = stored ? clean(stored) : null; if (result && leafCount(result) <= 4) return result; } catch { /* corrupt UI state should not block authored content */ } return defaultLayout([...noteIds][0] ?? ""); }

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } render() { return this.state.failed ? <div className="editor-loading" role="alert">This editor could not open. Your stored content is preserved. Reload to retry.</div> : this.props.children; } }

export function Workspace({ project, categoryTitle }: { project: Project; categoryTitle: string }) {
  const { dark } = useTheme();
  const { showToast } = useToast();
  const [normalized] = useState(() => normalizeProjectContent(contentOf(project)));
  const initial = normalized.content; const current = useRef<ProjectContent>(initial);
  const [layout, setLayout] = useState<PaneNode>(() => restoreLayout(`notespace.workspace-layout:${project.id}`, new Set(initial.notes.map((note) => note.id)), true));
  const [activePaneId, setActivePaneId] = useState(() => leaves(layout)[0]?.id ?? "");
  const [maximizedPaneId, setMaximizedPaneId] = useState<string | null>(null); const [maximizedSplitId, setMaximizedSplitId] = useState<string | null>(null);
  const [references, setReferences] = useState(project.references); const [status, setStatus] = useState<SaveStatus>({ state: "saved" });
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null); const [selectedBlockNoteId, setSelectedBlockNoteId] = useState<string | null>(null); const [selectedTextPaneId, setSelectedTextPaneId] = useState<string | null>(null); const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [highlightRequest, setHighlightRequest] = useState<{ paneId: string; request: number } | null>(null);
  const [documentFocus, setDocumentFocus] = useState<FocusRequest>(null); const [canvasFocus, setCanvasFocus] = useState<FocusRequest>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]); const [historyPreview, setHistoryPreview] = useState<HistorySnapshot | null>(null); const [historyOpen, setHistoryOpen] = useState(false);
  const historyDrawerRef = useRef<HTMLDivElement>(null);
  const dismissHistory = useCallback(() => setHistoryOpen(false), []);
  useDismissablePopup(historyDrawerRef, historyOpen, dismissHistory);
  const [renaming, setRenaming] = useState(false); const [renameTitle, setRenameTitle] = useState(project.title); const renameInput = useRef<HTMLInputElement>(null); const [deletingNote, setDeletingNote] = useState<Note | null>(null); const [renamingNote, setRenamingNote] = useState<{ paneId: string; noteId: string } | null>(null); const [noteTitle, setNoteTitle] = useState(""); const noteRenameInput = useRef<HTMLInputElement>(null); const navigationRequest = useRef(0);
  useExclusivePopup(!!deletingNote, () => setDeletingNote(null));
  const [saver] = useState(() => new Autosave(project.version, (value: ProjectContent, version) => saveProject(project.id, value, version)));
  const study = useStudySession(project.id, current.current.title);
  useEffect(() => { if (normalized.changed) saver.schedule(current.current); }, [normalized.changed, saver]);
  useEffect(() => saver.subscribe(setStatus), [saver]);
  useEffect(() => { if (status.state === "error") showToast({ kind: "error", message: status.message ?? "Save failed. Please retry.", action: { label: "Retry save", onClick: () => void saver.flush().catch(() => {}) } }); }, [saver, showToast, status]);
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
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && (maximizedPaneId || maximizedSplitId)) { setMaximizedPaneId(null); setMaximizedSplitId(null); } }; document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey); }, [maximizedPaneId, maximizedSplitId]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const noteId = params.get("note"); const blockId = params.get("block"); if (noteId) { const pane = leaves(layout).find((item) => item.kind === "note" && item.noteId === noteId); if (pane) setActivePaneId(pane.id); } if (blockId) setDocumentFocus({ id: blockId, request: ++navigationRequest.current }); }, [layout, project.id]);
  useBlocker({ shouldBlockFn: async () => { try { await saver.flush(); return false; } catch { return true; } }, enableBeforeUnload: () => saver.dirty });
  useEffect(() => { const flush = () => { if (document.visibilityState === "hidden") void saver.flush().catch(() => {}); }; document.addEventListener("visibilitychange", flush); return () => { document.removeEventListener("visibilitychange", flush); void saver.flush().catch(() => {}); }; }, [saver]);

  const update = useCallback((patch: Partial<ProjectContent>) => { current.current = { ...current.current, ...patch }; if (patch.references !== undefined) setReferences(patch.references); saver.schedule(current.current); }, [saver]);
  const updateDocument = useCallback((paneId: string, document: Snapshot) => { const pane = findPane(layout, paneId); if (!pane?.noteId) return; const now = new Date().toISOString(); const notes = current.current.notes.map((note) => note.id === pane.noteId ? { ...note, document, updatedAt: now } : note); const elements = Array.isArray(current.current.canvas.data.elements) ? current.current.canvas.data.elements.map((value) => { if (!value || typeof value !== "object") return value; const element = value as Record<string, unknown>; const meta = element.customData && typeof element.customData === "object" ? (element.customData as Record<string, unknown>).notespace : undefined; const blockId = meta && typeof meta === "object" ? (meta as Record<string, unknown>).blockId : undefined; if (typeof blockId !== "string" || element.type !== "text") return value; const text = documentBlockText(document, blockId); return text ? { ...element, text, originalText: text } : value; }) : []; update({ document, notes, canvas: { ...current.current.canvas, data: { ...current.current.canvas.data, elements } } }); }, [layout, update]);
  const updateCanvas = useCallback((canvas: Snapshot) => update({ canvas }), [update]);

  function splitPane(paneId: string, direction: "row" | "column") { if (leafCount(layout) >= 4) return; const source = findPane(layout, paneId); if (!source) return; if (source.kind === "canvas" && leaves(layout).some((pane) => pane.kind === "canvas")) return; const unused = current.current.notes.find((note) => !leaves(layout).some((pane) => pane.noteId === note.id)); if (!unused) { showToast({ kind: "error", message: "Create another note before splitting this pane." }); return; } const next: PaneNode = { kind: "leaf", pane: { id: newId(), kind: "note", noteId: unused.id } }; setLayout((value) => mapNode(value, paneId, (node) => ({ kind: "split", id: newId(), direction, ratio: .5, first: node, second: next }))); setActivePaneId(next.pane.id); }
  function addCanvasPane(paneId: string) { const existing = leaves(layout).find((pane) => pane.kind === "canvas"); if (existing) { setActivePaneId(existing.id); return; } if (leafCount(layout) >= 4) return; const next: PaneNode = { kind: "leaf", pane: { id: newId(), kind: "canvas" } }; setLayout((value) => mapNode(value, paneId, (node) => ({ kind: "split", id: newId(), direction: "row", ratio: .5, first: node, second: next }))); setActivePaneId(next.pane.id); }
  function openNotePane(paneId: string) { const existing = leaves(layout).find((pane) => pane.kind === "note"); if (existing) { setActivePaneId(existing.id); return; } const noteId = current.current.notes[0]?.id; if (!noteId || leafCount(layout) >= 4) return; const next: PaneNode = { kind: "leaf", pane: { id: newId(), kind: "note", noteId } }; setLayout((value) => mapNode(value, paneId, (node) => ({ kind: "split", id: newId(), direction: "row", ratio: .5, first: node, second: next }))); setActivePaneId(next.pane.id); }
  function closePane(paneId: string) { if (leafCount(layout) <= 1) return; const next = removeNode(layout, paneId); setLayout(next); if (activePaneId === paneId) setActivePaneId(leaves(next)[0]?.id ?? ""); if (maximizedPaneId === paneId) setMaximizedPaneId(null); if (maximizedSplitId && !findSplit(next, maximizedSplitId)) setMaximizedSplitId(null); }
  function maximizePane(paneId: string) { setMaximizedSplitId(null); setMaximizedPaneId(paneId); }
  function maximizeSplit(paneId: string) { const split = findContainingSplit(layout, paneId); if (!split) return; setMaximizedPaneId(null); setMaximizedSplitId(split.id); }
  function switchPaneNote(paneId: string, noteId: string) { const duplicate = leaves(layout).find((pane) => pane.kind === "note" && pane.noteId === noteId && pane.id !== paneId); if (duplicate) { setActivePaneId(duplicate.id); return; } setLayout((value) => mapNode(value, paneId, (node) => node.kind === "leaf" ? { ...node, pane: { ...node.pane, kind: "note", noteId } } : node)); setActivePaneId(paneId); }
  function createNote(paneId: string) { const now = new Date().toISOString(); const note: Note = { id: newId(), title: "Untitled", document: blankDocument(), createdAt: now, updatedAt: now }; update({ notes: [...current.current.notes, note], document: note.document }); switchPaneNote(paneId, note.id); }
  function beginRenameNote(pane: Pane, noteId = pane.noteId) { if (!noteId) return; const note = current.current.notes.find((item) => item.id === noteId); if (!note) return; setNoteTitle(note.title); setRenamingNote({ paneId: pane.id, noteId }); }
  function commitRenameNote(pane: Pane) { const value = noteTitle.trim(); const noteId = renamingNote?.paneId === pane.id ? renamingNote.noteId : pane.noteId; if (!noteId || !value) { setRenamingNote(null); return; } update({ notes: current.current.notes.map((note) => note.id === noteId ? { ...note, title: value, updatedAt: new Date().toISOString() } : note) }); setRenamingNote(null); }
  function highlightSelectedText() { if (!selectedTextPaneId || !selectedBlockId) return; setHighlightRequest({ paneId: selectedTextPaneId, request: ++navigationRequest.current }); }
  function removeNote() { if (!deletingNote || current.current.notes.length <= 1) return; const notes = current.current.notes.filter((note) => note.id !== deletingNote.id); const target = leaves(layout).find((pane) => pane.noteId === deletingNote.id); const replacement = notes[0]; update({ notes, document: replacement.document, references: current.current.references.filter((reference) => reference.noteId !== deletingNote.id && (reference.noteId !== undefined || !documentHasBlock(deletingNote.document, reference.blockId))) }); if (target) switchPaneNote(target.id, replacement.id); setDeletingNote(null); }
  function linkCanvasToBlock(note: Note, blockId: string) { if (!selectedElementId || !documentHasBlock(note.document, blockId) || current.current.references.some((reference) => reference.blockId === blockId && reference.elementId === selectedElementId)) return; update({ references: [...current.current.references, { id: newId(), noteId: note.id, blockId, elementId: selectedElementId }] }); showToast({ kind: "success", message: `Canvas linked to ${note.title}.` }); setSelectedBlockId(null); setSelectedElementId(null); }
  function createReference() { if (!selectedBlockId || !selectedElementId) return; const note = current.current.notes.find((item) => item.id === selectedBlockNoteId); if (note) linkCanvasToBlock(note, selectedBlockId); }
  function promoteBlockToCanvas() { if (!selectedBlockId) return; const note = current.current.notes.find((item) => item.id === selectedBlockNoteId) ?? current.current.notes[0]; const text = documentBlockText(note.document, selectedBlockId); if (!text) return; const elements = Array.isArray(current.current.canvas.data.elements) ? [...current.current.canvas.data.elements] : []; const cardId = newId(); const generated = convertToExcalidrawElements([{ type: "rectangle", id: cardId, x: 120 + (elements.length % 4) * 260, y: 120 + Math.floor(elements.length / 4) * 150, width: 230, height: 110, strokeColor: "#4f7396", backgroundColor: "#e8eef6", fillStyle: "solid", strokeWidth: 1, roughness: 0, customData: { notespace: { kind: "semantic-card", noteId: note.id, blockId: selectedBlockId } }, label: { text: text.slice(0, 180), fontSize: 16, fontFamily: 1, textAlign: "left", verticalAlign: "top", customData: { notespace: { kind: "semantic-card-label", cardId, noteId: note.id, blockId: selectedBlockId } } } }], { regenerateIds: false }); const card = generated.find((element: ExcalidrawElement) => element.id === cardId); if (!card) return; update({ canvas: { ...current.current.canvas, data: { ...current.current.canvas.data, elements: [...elements, ...generated] } }, references: [...current.current.references, { id: newId(), noteId: note.id, blockId: selectedBlockId, elementId: cardId }] }); setSelectedElementId(cardId); addCanvasPane(activePaneId); showToast({ kind: "success", message: "Semantic card added to Canvas." }); }
  function promoteCanvasToNote() { if (!selectedElementId) return; const text = canvasElementText(current.current.canvas, selectedElementId); if (!text) return; const now = new Date().toISOString(); const blockId = newId(); const note: Note = { id: newId(), title: text.slice(0, 48), document: { ...blankDocument(blockId), data: { type: "doc", content: [{ type: "paragraph", attrs: { blockId }, content: [{ type: "text", text }] }] } }, createdAt: now, updatedAt: now }; update({ notes: [...current.current.notes, note], document: note.document }); const canvas = leaves(layout).find((pane) => pane.kind === "canvas"); if (canvas) { const pane = { id: newId(), kind: "note" as const, noteId: note.id }; setLayout((value) => mapNode(value, canvas.id, (node) => ({ kind: "split", id: newId(), direction: "row", ratio: .5, first: node, second: { kind: "leaf", pane } }))); setActivePaneId(pane.id); } }
  async function openHistory() { setHistoryOpen((value) => !value); if (!historyEntries.length) { try { setHistoryEntries(await listHistory(project.id)); } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load history." }); } } }
  async function previewHistory(entry: HistoryEntry) { try { setHistoryPreview(await getHistorySnapshot(project.id, entry.id)); } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not load checkpoint." }); } }
  async function restoreSelectedHistory() { if (!historyPreview) return; try { await saver.flush(); await restoreHistory(project.id, historyPreview.id); window.location.reload(); } catch (err) { showToast({ kind: "error", message: err instanceof Error ? err.message : "Could not restore checkpoint." }); } }
  function navigateToCanvas(reference: ProjectReference) { if (!canvasHasElement(current.current.canvas, reference.elementId)) { showToast({ kind: "error", message: "Linked Canvas object no longer exists. The reference was kept.", action: { label: "Remove link", onClick: () => update({ references: references.filter((item) => item.id !== reference.id) }) } }); return; } const canvas = leaves(layout).find((pane) => pane.kind === "canvas"); if (canvas) setActivePaneId(canvas.id); else addCanvasPane(activePaneId); setCanvasFocus({ id: reference.elementId, request: ++navigationRequest.current }); }
  function navigateToNote(reference: ProjectReference) { const note = reference.noteId ? current.current.notes.find((item) => item.id === reference.noteId) : current.current.notes[0]; if (!note || !documentHasBlock(note.document, reference.blockId)) { showToast({ kind: "error", message: "Linked note block no longer exists. The reference was kept.", action: { label: "Remove link", onClick: () => update({ references: references.filter((item) => item.id !== reference.id) }) } }); return; } const pane = leaves(layout).find((item) => item.kind === "note" && item.noteId === note.id); if (pane) setActivePaneId(pane.id); else { const target = leaves(layout).find((item) => item.kind === "note"); if (target) switchPaneNote(target.id, note.id); } setDocumentFocus({ id: reference.blockId, request: ++navigationRequest.current }); }
  const blockReference = selectedBlockId ? references.find((reference) => reference.blockId === selectedBlockId && (!reference.noteId || reference.noteId === selectedBlockNoteId)) : undefined; const elementReference = selectedElementId ? references.find((reference) => reference.elementId === selectedElementId) : undefined;
  function renameWorkspace() { const value = renameTitle.trim(); if (value && value !== current.current.title) update({ title: value }); setRenaming(false); }

  function selectionContext(pane: Pane, content: ReactNode) {
    const noteSelection = pane.kind === "note" && !!selectedBlockId && selectedBlockNoteId === pane.noteId;
    const textSelection = noteSelection && selectedTextPaneId === pane.id;
    const canvasSelection = pane.kind === "canvas" && !!selectedElementId;
    const noteLinkHint = !noteSelection ? "Select a block in this Note first" : !selectedElementId ? "Select a Canvas object first" : null;
    return <ContextMenu>
      <ContextMenuTrigger asChild><div className="pane-content-context">{content}</div></ContextMenuTrigger>
      <ContextMenuContent>
        {textSelection && <ContextMenuItem onSelect={highlightSelectedText}><Highlighter size={13} /> Highlight text</ContextMenuItem>}
        {noteSelection && <ContextMenuItem onSelect={promoteBlockToCanvas}><Layers size={13} /> Send to Canvas</ContextMenuItem>}
        {noteSelection && blockReference && <ContextMenuItem onSelect={() => navigateToCanvas(blockReference)}><Layers size={13} /> Go to linked Canvas</ContextMenuItem>}
        {pane.kind === "canvas" && <ContextMenuItem disabled={!canvasSelection} onSelect={promoteCanvasToNote}><FileText size={13} /> Send to Note</ContextMenuItem>}
        {canvasSelection && elementReference && <ContextMenuItem onSelect={() => navigateToNote(elementReference)}><FileText size={13} /> Go to linked note</ContextMenuItem>}
        {pane.kind === "canvas" && <ContextMenuSub>
          <ContextMenuSubTrigger><Link2 size={13} /> Link selected object to note</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {canvasSelection ? current.current.notes.map((note) => {
              const blocks = documentBlocks(note.document);
              return <ContextMenuSub key={note.id}>
                <ContextMenuSubTrigger>{note.title}</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {blocks.length ? blocks.map((block) => <ContextMenuItem key={block.id} onSelect={() => linkCanvasToBlock(note, block.id)}>{block.label}</ContextMenuItem>) : <ContextMenuItem disabled>No linkable blocks</ContextMenuItem>}
                </ContextMenuSubContent>
              </ContextMenuSub>;
            }) : <ContextMenuItem disabled>Select a Canvas object first</ContextMenuItem>}
          </ContextMenuSubContent>
        </ContextMenuSub>}
        {pane.kind === "note" && <ContextMenuItem disabled={!!noteLinkHint} onSelect={createReference}><Link2 size={13} /> Link selected block to Canvas {noteLinkHint && <span className="ml-auto text-[10px] text-[var(--muted)]">{noteLinkHint}</span>}</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>;
  }

  function renderPane(pane: Pane) {
    const note = pane.noteId ? current.current.notes.find((item) => item.id === pane.noteId) : undefined;
    const isActive = pane.id === activePaneId;
    const containingSplit = findContainingSplit(layout, pane.id);
    const noteHeader = pane.kind === "note" && (renamingNote?.paneId === pane.id ? <input ref={noteRenameInput} className="pane-title-input" aria-label="Note title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} onBlur={() => commitRenameNote(pane)} onKeyDown={(event) => { if (event.key === "Enter") commitRenameNote(pane); if (event.key === "Escape") setRenamingNote(null); }} /> : <div className="pane-note-controls">
      <details className="pane-note-switcher">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <summary onDoubleClick={(event) => { event.preventDefault(); beginRenameNote(pane); }}><FileText size={14} /><span>{note?.title ?? "Untitled"}</span><ChevronDown size={13} /></summary>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => beginRenameNote(pane)}><Pencil size={13} /> Rename note</ContextMenuItem>
            <ContextMenuItem disabled={current.current.notes.length <= 1} onSelect={() => { if (note) setDeletingNote(note); }}><Trash2 size={13} /> Delete note</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className="pane-note-menu" role="listbox" aria-label="Notes in this workspace">
          {current.current.notes.map((item) => <ContextMenu key={item.id}>
            <ContextMenuTrigger asChild>
              <button role="option" aria-selected={item.id === pane.noteId} onClick={() => switchPaneNote(pane.id, item.id)} onDoubleClick={(event) => { event.preventDefault(); switchPaneNote(pane.id, item.id); beginRenameNote(pane, item.id); }}>{item.title}</button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => switchPaneNote(pane.id, item.id)}><MoveRight size={13} /> Move to this pane</ContextMenuItem>
              <ContextMenuItem onSelect={() => { switchPaneNote(pane.id, item.id); beginRenameNote(pane, item.id); }}><Pencil size={13} /> Rename note</ContextMenuItem>
              <ContextMenuItem disabled={current.current.notes.length <= 1} onSelect={() => setDeletingNote(item)}><Trash2 size={13} /> Delete note</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>)}
        </div>
      </details>
      <button className="pane-add-note" type="button" aria-label="New note" title="New note" onClick={() => createNote(pane.id)}><Plus size={14} /></button>
    </div>);
    const surface = pane.kind === "note" && note ? <EditorBoundary><Suspense fallback={<div className="editor-loading">Opening note…</div>}><DocumentEditor key={pane.id} workspaceId={project.id} initial={note.document} onChange={(document) => updateDocument(pane.id, document)} onBlockSelect={(id, hasTextSelection) => { setSelectedBlockId(id); setSelectedBlockNoteId(pane.noteId ?? null); setSelectedTextPaneId(hasTextSelection ? pane.id : null); }} highlightRequest={highlightRequest?.paneId === pane.id ? highlightRequest.request : null} focusRequest={documentFocus} /></Suspense></EditorBoundary> : <EditorBoundary><Suspense fallback={<div className="editor-loading">Opening Canvas…</div>}><CanvasEditor workspaceId={project.id} initial={current.current.canvas} onChange={updateCanvas} onElementSelect={setSelectedElementId} focusRequest={canvasFocus} dark={dark} /></Suspense></EditorBoundary>;
    return <section key={pane.id} className={isActive ? "authoring-pane is-active" : "authoring-pane"} onMouseDown={() => setActivePaneId(pane.id)} aria-label={pane.kind === "canvas" ? "Canvas pane" : `${note?.title ?? "Note"} note pane`}><header className="pane-header">{noteHeader ?? <span className="pane-title"><Layers size={14} /> Canvas</span>}<details className="pane-actions"><summary aria-label={`Actions for ${pane.kind === "canvas" ? "Canvas" : note?.title ?? "Note"}`}><MoreHorizontal size={17} /></summary><div className="pane-menu">{pane.kind === "canvas" && <button onClick={() => openNotePane(pane.id)}>Open note</button>}{pane.kind === "note" && <><button onClick={() => addCanvasPane(pane.id)}>Open Canvas</button><button disabled={leafCount(layout) >= 4} title={leafCount(layout) >= 4 ? "Maximum 4 panes per workspace." : undefined} onClick={() => splitPane(pane.id, "row")}>Split right</button><button disabled={leafCount(layout) >= 4} title={leafCount(layout) >= 4 ? "Maximum 4 panes per workspace." : undefined} onClick={() => splitPane(pane.id, "column")}>Split down</button><button onClick={() => beginRenameNote(pane)}>Rename note</button><button disabled={current.current.notes.length <= 1} onClick={() => { if (note) setDeletingNote(note); }}>Delete note</button></>}{containingSplit && <button onClick={() => maximizeSplit(pane.id)}>Maximize split</button>}<button onClick={() => maximizePane(pane.id)}>Maximize pane</button><button disabled={leafCount(layout) <= 1} onClick={() => closePane(pane.id)}>Close pane</button></div></details></header>{selectionContext(pane, surface)}</section>;
  }
  function renderNode(node: PaneNode): ReactNode { if (node.kind === "leaf") return renderPane(node.pane); const ratio = node.ratio; return <div className={`pane-group pane-group-${node.direction}`} key={node.id} style={node.direction === "row" ? { gridTemplateColumns: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` } : { gridTemplateRows: `minmax(0, ${ratio}fr) 7px minmax(0, ${1 - ratio}fr)` }}>{renderNode(node.first)}<div className="pane-resizer" role="separator" tabIndex={0} aria-label={`Resize ${node.direction === "row" ? "horizontal" : "vertical"} panes`} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") setLayout((value) => updateSplit(value, node.id, ratio - .05)); if (event.key === "ArrowRight" || event.key === "ArrowDown") setLayout((value) => updateSplit(value, node.id, ratio + .05)); }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const start = node.direction === "row" ? event.clientX : event.clientY; const bounds = event.currentTarget.parentElement?.getBoundingClientRect(); if (!bounds) return; const size = node.direction === "row" ? bounds.width : bounds.height; const move = (moveEvent: PointerEvent) => { const position = node.direction === "row" ? moveEvent.clientX : moveEvent.clientY; setLayout((value) => updateSplit(value, node.id, ratio + (position - start) / size)); }; const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop); }} /><div>{renderNode(node.second)}</div></div>; }

  const maximizedSplit = maximizedSplitId ? findSplit(layout, maximizedSplitId) : undefined;
  const focusMode = Boolean(maximizedPaneId || maximizedSplitId);
  const visible = maximizedPaneId ? (findPane(layout, maximizedPaneId) ? renderPane(findPane(layout, maximizedPaneId)!) : renderNode(layout)) : maximizedSplit ? renderNode(maximizedSplit) : renderNode(layout);
  return <div className="workspace-shell"><main className={focusMode ? "workspace-main is-focus-mode" : "workspace-main"}><header className="topbar workspace-header"><div className="workspace-identity"><Link to="/" className="icon-button" aria-label="Back to library" title="Back to library"><ArrowLeft size={18} /></Link><span className="workspace-breadcrumb">{categoryTitle} /</span>{renaming ? <input ref={renameInput} className="inline-title-input" aria-label="Workspace title" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} onBlur={renameWorkspace} onKeyDown={(event) => { if (event.key === "Enter") renameWorkspace(); if (event.key === "Escape") setRenaming(false); }} /> : <button className="workspace-title-button" onClick={() => { setRenameTitle(current.current.title); setRenaming(true); }}><span className="workspace-title">{current.current.title}</span><Pencil size={13} /></button>}</div><div className="header-actions">{!focusMode && <StudyIndicator study={study} />}<span className={`save-status status-${status.state}`} role="status" aria-live="polite">{status.state === "saved" ? <Check size={14} /> : status.state === "saving" ? <Loader2 size={14} className="spin" /> : <Circle size={10} />}{status.state === "saved" ? "Saved" : status.state === "saving" ? "Saving…" : status.state === "error" ? "Not saved" : "Unsaved"}</span><details className="workspace-overflow"><summary className="icon-button" aria-label="Workspace actions"><MoreHorizontal size={18} /></summary><div className="workspace-menu-popover"><button className="menu-item" onClick={() => void openHistory()}><HistoryIcon size={14} /> History</button><a className="menu-item" href={exportWorkspace(project.id)} download><Download size={14} /> Export</a></div></details><ThemeToggle /></div></header>{focusMode && <div className="focus-mode-timer"><StudyIndicator study={study} /></div>}<div className={focusMode ? "authoring-canvas is-maximized" : "authoring-canvas"}>{visible}</div>{focusMode && <button className="restore-pane-button" onClick={() => { setMaximizedPaneId(null); setMaximizedSplitId(null); }}>Restore layout <span>Esc</span></button>}</main><Dialog.Root open={!!deletingNote} onOpenChange={(open) => { if (!open) setDeletingNote(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><Dialog.Title>Delete this note?</Dialog.Title><Dialog.Description>“{deletingNote?.title}” will be removed from this workspace.</Dialog.Description><div className="dialog-actions"><Dialog.Close className="secondary">Keep note</Dialog.Close><button className="danger" onClick={removeNote}>Delete note</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>{historyOpen && <div ref={historyDrawerRef} className="history-drawer"><div className="history-drawer-heading"><strong>History</strong><button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="Close history">×</button></div>{historyEntries.length ? historyEntries.map((entry) => <button key={entry.id} className={historyPreview?.id === entry.id ? "history-entry active" : "history-entry"} onClick={() => void previewHistory(entry)}><span>{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · v{entry.version}</span><span>{entry.title}</span></button>) : <p className="history-empty">No checkpoints yet.</p>}{historyPreview && <div className="history-preview"><strong>Preview v{historyPreview.version}</strong><span>{historyPreview.notes.length} notes · {canvasObjectCount(historyPreview.canvas)} Canvas objects</span><p>{documentText(historyPreview.document).slice(0, 180) || "Empty document"}</p><button className="text-button" onClick={() => void restoreSelectedHistory()}>Restore</button></div>}</div>}</div>;
}
