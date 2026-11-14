import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import "katex/dist/katex.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { listNoteBacklinks, type Note } from "../../../../adapters/http/note-api";
import { searchNotespace, type SearchResult } from "../../../../adapters/http/workspace-api";
import { storeImageAsset } from "../../../../adapters/assets/image-store";
import { createNoteExtensions, ensureNoteBlockIds } from "./note-extensions";
import { sanitizePastedHTML } from "./note-sanitize";
import { noteFirstLine, readCanvasNoteReference, type CanvasNoteReference, type NoteDocument } from "../../../../domain/note/note";
import type { CanvasNoteEntry, NoteSaveState, NoteSaveStatus } from "./canvas-note-store";
import { noteCardDetail, noteCardFrame, noteCardLabelFontSize, noteCardUiScale, type NoteCardDetail } from "./note-card-layout";
import { noteSlashQuery } from "./note-slash";
import { NoteReadView } from "./NoteReadView";
import { CanvasNoteStoreProvider, useCanvasNoteSnapshot, useCanvasNoteStore } from "./use-canvas-note-store";

type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };

/** Document-level commands; they live under the card's More menu, never in the selection bubble (B11). */
export type NoteDocumentTool = "find" | "backlinks" | "import" | "export" | "ai";
const documentTools: ReadonlyArray<[NoteDocumentTool, string]> = [
  ["find", "Find in note"],
  ["backlinks", "Backlinks"],
  ["import", "Import .md"],
  ["export", "Export .md"],
  ["ai", "AI writing"],
];

export function CanvasNoteActions({ folded, onEdit, onToggleFold, onDocumentTool, onDuplicate, onDelete }: {
  folded: boolean;
  onEdit: () => void;
  onToggleFold: () => void;
  onDocumentTool: (tool: NoteDocumentTool) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  return <div className="notespace-note-actions pointer-events-auto relative z-[1] flex w-fit items-center gap-0.5 rounded-lg border border-line bg-surface p-1" role="toolbar" aria-label="Canvas Note actions">
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={onEdit}>Edit</button>
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={onToggleFold}>{folded ? "Unfold" : "Fold"}</button>
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" aria-expanded={more} onClick={() => setMore((value) => !value)}>More</button>
    {more && <div className="absolute right-0 top-full mt-1 grid min-w-40 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]">
      {documentTools.map(([tool, label]) => <button key={tool} type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onDocumentTool(tool); }}>{label}</button>)}
      <span className="my-0.5 h-px bg-line" aria-hidden="true" />
      <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={onDuplicate}>Duplicate</button>
      <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-danger hover:bg-tint" onClick={onDelete}>Remove instance</button>
    </div>}
  </div>;
}

function previewText(document: NoteDocument) {
  const walk = (nodes: NoteDocument["content"]): string[] => nodes.flatMap((node) => [
    ...(node.text ? [node.text] : []),
    ...(node.type === "noteEmbed" ? [typeof node.attrs?.label === "string" ? node.attrs.label : "Embedded Note"] : []),
    ...(node.type === "noteBlockReference" ? [`Block reference: ${typeof node.attrs?.blockId === "string" ? node.attrs.blockId : "missing"}`] : []),
    ...(node.content ? walk(node.content) : []),
  ]);
  return walk(document.content).join(" ").trim();
}

function backlinkExcerpt(value: string) {
  try {
    const parsed = JSON.parse(value) as NoteDocument;
    return previewText(parsed) || "Canvas Note";
  } catch {
    return value.replace(/\s+/g, " ").trim().slice(0, 160) || "Canvas Note";
  }
}

type MarkdownPrompt = { kind: "import" | "export"; markdown: string; losses: string[] };
type CaretPosition = { left: number; top: number };

const FALLBACK_POSITION: CaretPosition = { left: 8, top: 36 };

/** Anchors a popup just below the caret, inside the card, so it opens where the user is typing (B11). */
function caretPosition(value: Editor, host: HTMLElement | null): CaretPosition {
  const box = host?.getBoundingClientRect();
  if (!box) return FALLBACK_POSITION;
  const coords = value.view.coordsAtPos(value.state.selection.from);
  return {
    left: Math.min(Math.max(8, coords.left - box.left), Math.max(8, box.width - 200)),
    top: coords.bottom - box.top + 4,
  };
}

const markdownNodeTypes = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "taskList", "taskItem",
  "blockquote", "codeBlock", "hardBreak", "horizontalRule", "table", "tableRow", "tableHeader", "tableCell",
  "inlineMath", "blockMath", "noteImage", "noteEmbed", "noteBlockReference",
]);
const markdownMarkTypes = new Set(["bold", "italic", "strike", "code", "underline", "link", "subscript", "superscript"]);

function markdownLosses(document: NoteDocument): string[] {
  const losses = new Set<string>();
  const walk = (nodes: NoteDocument["content"]) => {
    for (const node of nodes) {
      if (!markdownNodeTypes.has(node.type)) losses.add(`Unsupported node: ${node.type}`);
      for (const mark of node.marks ?? []) if (!markdownMarkTypes.has(mark.type)) losses.add(`Unsupported mark: ${mark.type}`);
      if (node.content) walk(node.content);
    }
  };
  walk(document.content);
  return [...losses];
}

function downloadMarkdown(noteId: string, markdown: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `note-${noteId}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function NoteEditor(props: {
  note: Note;
  elementId: string;
  workspaceId: string;
  documentTool: NoteDocumentTool | null;
  onDocumentToolHandled: () => void;
  onDocumentChange: (document: NoteDocument) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onError: (message: string) => void;
  onEscape: () => void;
}) {
  const { note, elementId, workspaceId, documentTool, onDocumentToolHandled, onDocumentChange, onAutoResize, onPlaceLinkedNote, onError, onEscape } = props;
  // A slash command is open only while the text before the caret ends in "/query" (see noteSlashQuery).
  const [slash, setSlash] = useState<{ query: string; index: number } | null>(null);
  const [slashPosition, setSlashPosition] = useState<CaretPosition>(FALLBACK_POSITION);
  const [referencePosition, setReferencePosition] = useState<CaretPosition>(FALLBACK_POSITION);
  const [linkURL, setLinkURL] = useState("");
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [markdownPrompt, setMarkdownPrompt] = useState<MarkdownPrompt | null>(null);
  const [referenceQuery, setReferenceQuery] = useState<string | null>(null);
  const [referenceResults, setReferenceResults] = useState<SearchResult[]>([]);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [backlinks, setBacklinks] = useState<SearchResult[]>([]);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const appliedNoteIdRef = useRef(note.id);
  const appliedRevisionRef = useRef(note.revision);
  const referenceResultsRef = useRef<SearchResult[]>([]);
  const referencePickRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Keyboard and tool handlers are read through refs so they always see the current menu state.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const documentToolRef = useRef<(tool: NoteDocumentTool) => void>(() => {});
  const handledRef = useRef(onDocumentToolHandled);
  handledRef.current = onDocumentToolHandled;
  const [extensions] = useState(createNoteExtensions);
  const insertImageFile = useCallback(async (file: File) => {
    const value = editorRef.current;
    if (!file.type.startsWith("image/") || !value) return false;
    try {
      const assetId = crypto.randomUUID();
      await storeImageAsset(workspaceId, assetId, file);
      const src = "/api/workspaces/" + encodeURIComponent(workspaceId) + "/assets/" + encodeURIComponent(assetId);
      value.chain().focus().insertContent({ type: "noteImage", attrs: { src, assetId, alt: file.name } }).run();
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not add this image to the Note.");
      return false;
    }
  }, [onError, workspaceId]);
  const syncTriggers = (value: Editor) => {
    const beforeCaret = value.state.doc.textBetween(0, value.state.selection.from, "\n");
    const reference = beforeCaret.match(/\[\[([^\]]*)$/);
    setReferenceQuery(reference ? reference[1] ?? "" : null);
    if (reference) {
      setReferenceIndex(0);
      setReferencePosition(caretPosition(value, containerRef.current));
    }
    const query = noteSlashQuery(beforeCaret);
    if (query === null) {
      setSlash(null);
      return;
    }
    setSlashPosition(caretPosition(value, containerRef.current));
    setSlash((previous) => ({ query, index: previous?.query === query ? previous.index : 0 }));
  };
  const editor = useEditor({
    extensions,
    content: note.document,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "notespace-note-content outline-none", "aria-label": "Note content" },
      transformPastedHTML: sanitizePastedHTML,
      handlePaste: (_view, event) => {
        const file = [...(event.clipboardData?.files ?? [])].find((value) => value.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        void insertImageFile(file);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const file = [...(event.dataTransfer?.files ?? [])].find((value) => value.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        void insertImageFile(file);
        return true;
      },
      handleKeyDown: (_view, event) => keyHandlerRef.current(event),
    },
    onUpdate: ({ editor: value }) => {
      onDocumentChange(value.getJSON() as NoteDocument);
      syncTriggers(value);
    },
    onSelectionUpdate: ({ editor: value }) => {
      setHasTextSelection(!value.state.selection.empty);
      syncTriggers(value);
    },
    onCreate: ({ editor: value }) => {
      const normalized = ensureNoteBlockIds(value.getJSON() as NoteDocument);
      if (JSON.stringify(normalized) !== JSON.stringify(value.getJSON())) {
        value.commands.setContent(normalized, { emitUpdate: false });
        onDocumentChange(normalized);
      }
      if (typeof window !== "undefined") window.requestAnimationFrame(() => value.commands.focus("end"));
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    referenceResultsRef.current = referenceResults;
  }, [referenceResults]);

  useEffect(() => {
    if (!editor) return undefined;
    const frame = window.requestAnimationFrame(() => editor.commands.focus("end"));
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  useEffect(() => {
    if (referenceQuery === null) {
      setReferenceResults([]);
      return undefined;
    }
    const query = referenceQuery.trim();
    if (!query) {
      setReferenceResults([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchNotespace(query).then((results) => {
        if (active) setReferenceResults(results.filter((result) => result.type === "note" && result.noteId).slice(0, 8));
      }).catch(() => { if (active) setReferenceResults([]); });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [referenceQuery]);

  useEffect(() => {
    if (!backlinksOpen) {
      setBacklinks([]);
      return undefined;
    }
    let active = true;
    void listNoteBacklinks(note.id).then((results) => {
      if (!active) return;
      setBacklinks(results.map((result) => ({ ...result, type: "note" as const, workspaceId: result.workspaceId ?? "", workspaceTitle: result.workspaceTitle ?? "", excerpt: backlinkExcerpt(result.excerpt) })).slice(0, 8));
    }).catch(() => { if (active) setBacklinks([]); });
    return () => { active = false; };
  }, [backlinksOpen, note.id]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const reportSize = () => onAutoResize(elementId, Math.max(180, Math.ceil(dom.scrollHeight + 24)));
    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(dom);
    return () => observer.disconnect();
  }, [editor, elementId, onAutoResize]);

  useEffect(() => {
    if (!editor) return;
    const noteIdentityChanged = appliedNoteIdRef.current !== note.id;
    const serverRevisionChanged = appliedRevisionRef.current !== note.revision;
    if (noteIdentityChanged || serverRevisionChanged) {
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(note.document)) editor.commands.setContent(note.document, { emitUpdate: false });
      appliedNoteIdRef.current = note.id;
      appliedRevisionRef.current = note.revision;
    }
  }, [editor, note.id, note.revision, note.document]);

  // A More-menu command runs once the editor is mounted, then the request is released.
  useEffect(() => {
    if (!documentTool || !editor) return;
    documentToolRef.current(documentTool);
    handledRef.current();
  }, [documentTool, editor]);

  const applyReference = useCallback((result: SearchResult, mode: "link" | "embed" = "link") => {
    if (!editor || !result.noteId) return;
    const beforeCaret = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
    const match = beforeCaret.match(/\[\[([^\]]*)$/);
    if (!match) return;
    const from = editor.state.selection.from - match[0].length;
    const label = result.excerpt.trim() || "Canvas Note";
    const targetWorkspace = result.workspaceId || workspaceId;
    const href = `/workspaces/${encodeURIComponent(targetWorkspace)}?noteId=${encodeURIComponent(result.noteId)}`;
    if (mode === "embed") {
      editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).insertContentAt(from, {
        type: "noteEmbed",
        attrs: { noteId: result.noteId, workspaceId: targetWorkspace, label },
      }).run();
    } else {
      editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).insertContentAt(from, label).setTextSelection({ from, to: from + label.length }).setLink({ href }).setTextSelection(from + label.length).run();
    }
    setReferenceQuery(null);
  }, [editor, workspaceId]);

  useEffect(() => {
    referencePickRef.current = () => {
      const result = referenceResultsRef.current[referenceIndex % Math.max(1, referenceResultsRef.current.length)];
      if (result) applyReference(result);
    };
  }, [applyReference, referenceIndex]);

  if (!editor) return null;
  const commands = [
    ["Heading", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ["Bullet list", () => editor.chain().focus().toggleBulletList().run()],
    ["Checklist", () => editor.chain().focus().toggleTaskList().run()],
    ["Code block", () => editor.chain().focus().toggleCodeBlock().run()],
    ["Quote", () => editor.chain().focus().toggleBlockquote().run()],
    ["Callout", () => editor.chain().focus().wrapIn("noteCallout", { tone: "note" }).run()],
    ["Table", () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()],
    ["Image", () => imageInputRef.current?.click()],
    ["Math", () => editor.chain().focus().insertInlineMath({ latex: "x^2" }).run()],
    ["Block reference", () => {
      const parent = editor.state.selection.$from.parent;
      const blockId = typeof parent.attrs.blockId === "string" && parent.attrs.blockId ? parent.attrs.blockId : crypto.randomUUID();
      if (!parent.attrs.blockId) {
        editor.commands.command(({ tr, state }) => {
          tr.setNodeMarkup(state.selection.$from.before(), undefined, { ...parent.attrs, blockId });
          return true;
        });
      }
      editor.chain().focus().insertContent({ type: "noteBlockReference", attrs: { noteId: note.id, workspaceId, blockId } }).run();
    }],
  ] as const;
  const visibleCommands = slash ? commands.filter(([label]) => label.toLowerCase().includes(slash.query.toLowerCase())) : [];
  const runSlashCommand = (command: () => void) => {
    const position = editor.state.selection.from;
    const length = (slash?.query.length ?? 0) + 1;
    editor.chain().focus().deleteRange({ from: Math.max(1, position - length), to: position }).run();
    setSlash(null);
    command();
  };
  const exportMarkdown = () => {
    const markdown = editor.getMarkdown();
    const losses = markdownLosses(editor.getJSON() as NoteDocument);
    if (losses.length) setMarkdownPrompt({ kind: "export", markdown, losses });
    else downloadMarkdown(note.id, markdown);
  };
  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    try {
      const markdown = await file.text();
      const previous = editor.getJSON();
      editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
      const losses = markdownLosses(editor.getJSON() as NoteDocument);
      editor.commands.setContent(previous, { emitUpdate: false });
      setMarkdownPrompt({ kind: "import", markdown, losses });
    }
    catch (error) { onError(error instanceof Error ? error.message : "Could not import Markdown."); }
  };
  const importImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (file) await insertImageFile(file);
  };
  const setLink = () => { const href = linkURL.trim(); if (href) editor.chain().focus().setLink({ href }).run(); setLinkURL(""); };
  const confirmMarkdown = () => {
    if (!markdownPrompt) return;
    if (markdownPrompt.kind === "export") downloadMarkdown(note.id, markdownPrompt.markdown);
    else editor.commands.setContent(markdownPrompt.markdown, { contentType: "markdown" });
    setMarkdownPrompt(null);
  };
  const findMatches = (query: string) => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [] as Array<{ from: number; to: number }>;
    const matches: Array<{ from: number; to: number }> = [];
    editor.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return;
      const text = node.text.toLocaleLowerCase();
      let offset = text.indexOf(normalized);
      while (offset >= 0) {
        matches.push({ from: position + offset, to: position + offset + normalized.length });
        offset = text.indexOf(normalized, offset + normalized.length);
      }
    });
    return matches;
  };
  const findInNote = (direction: 1 | -1) => {
    const matches = findMatches(findQuery);
    if (!matches.length) return;
    const next = (findIndex + direction + matches.length) % matches.length;
    const match = matches[next];
    setFindIndex(next);
    editor.chain().focus().setTextSelection(match).scrollIntoView().run();
  };
  const runDocumentTool = (tool: NoteDocumentTool) => {
    if (tool === "find") { setFindOpen(true); setFindIndex(0); }
    if (tool === "backlinks") setBacklinksOpen(true);
    if (tool === "import") importInputRef.current?.click();
    if (tool === "export") exportMarkdown();
    if (tool === "ai") setAiUnavailable(true);
  };
  documentToolRef.current = runDocumentTool;
  const handleEditorKey = (event: KeyboardEvent): boolean => {
    if (slash && visibleCommands.length > 0) {
      if (event.key === "ArrowDown") { event.preventDefault(); setSlash({ ...slash, index: slash.index + 1 }); return true; }
      if (event.key === "ArrowUp") { event.preventDefault(); setSlash({ ...slash, index: Math.max(0, slash.index - 1) }); return true; }
      if (event.key === "Enter") {
        event.preventDefault();
        runSlashCommand(visibleCommands[slash.index % visibleCommands.length][1]);
        return true;
      }
    }
    if (referenceQuery !== null && event.key === "ArrowDown") {
      event.preventDefault(); setReferenceIndex((value) => value + 1); return true;
    }
    if (referenceQuery !== null && event.key === "ArrowUp") {
      event.preventDefault(); setReferenceIndex((value) => Math.max(0, value - 1)); return true;
    }
    if (referenceQuery !== null && event.key === "Enter") {
      const result = referenceResultsRef.current[referenceIndex % Math.max(1, referenceResultsRef.current.length)];
      if (result) { event.preventDefault(); referencePickRef.current?.(); return true; }
    }
    if (referenceQuery !== null && event.key === "Escape") {
      event.preventDefault(); setReferenceQuery(null); return true;
    }
    if (event.key !== "Escape") return false;
    event.preventDefault();
    if (slash) { setSlash(null); return true; }
    onEscape();
    return true;
  };
  keyHandlerRef.current = handleEditorKey;
  return (
    <div className="relative" ref={containerRef}>
      <input ref={importInputRef} type="file" accept=".md,text/markdown" className="hidden" onChange={(event) => { void importMarkdown(event); }} aria-label="Import Markdown" />
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void importImage(event); }} aria-label="Insert image" />
      {markdownPrompt && <div className="mb-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] text-ink" role="alert" aria-label="Markdown import export review">
        <p className="m-0 font-semibold">Review Markdown {markdownPrompt.kind}</p>
        <p className="m-0 mt-0.5 text-muted">{markdownPrompt.losses.length ? markdownPrompt.losses.join("; ") : "The current document will be replaced after confirmation."}</p>
        <div className="mt-1.5 flex gap-1.5">
          <button type="button" className="rounded border border-accent px-1.5 py-1 text-accent" onClick={confirmMarkdown}>{markdownPrompt.kind === "export" ? "Export anyway" : "Apply import"}</button>
          <button type="button" className="rounded border border-line px-1.5 py-1 text-muted" onClick={() => setMarkdownPrompt(null)}>Cancel</button>
        </div>
      </div>}
      {hasTextSelection && <div className="notespace-note-ui absolute bottom-full left-1/2 z-20 mb-1 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Note formatting">
        {[
          ["Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold")],
          ["Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic")],
          ["Underline", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline")],
          ["Code", () => editor.chain().focus().toggleCode().run(), editor.isActive("code")],
        ].map(([label, command, active]) => <button key={String(label)} type="button" className={"rounded px-1.5 py-1 text-[10px] " + (active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink")} aria-label={String(label)} aria-pressed={Boolean(active)} onMouseDown={(event) => event.preventDefault()} onClick={() => (command as () => void)()}>{String(label)}</button>)}
        {editor.isActive("table") && <>
          <button type="button" className="rounded px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Row +</button>
          <button type="button" className="rounded px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Column +</button>
          <button type="button" className="rounded px-1.5 py-1 text-[10px] text-danger hover:bg-tint" aria-label="Delete table" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
        </>}
        <input className="ml-1 h-6 min-w-0 flex-1 rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent" value={linkURL} onChange={(event) => setLinkURL(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setLink(); } }} placeholder="Link URL or /workspaces/id?noteId=..." aria-label="Link URL" />
      </div>}
      {findOpen && <div className="notespace-note-ui absolute bottom-full left-1/2 z-20 mb-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1" role="search" aria-label="Find in Note">
        <input autoFocus className="h-6 w-32 rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent" value={findQuery} onChange={(event) => { setFindQuery(event.target.value); setFindIndex(0); }} placeholder="Find in Note" aria-label="Find in Note query" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); findInNote(event.shiftKey ? -1 : 1); } }} />
        <button type="button" className="rounded px-1 py-1 text-[10px] text-muted hover:bg-tint" onClick={() => findInNote(-1)} aria-label="Previous match">Prev</button>
        <button type="button" className="rounded px-1 py-1 text-[10px] text-muted hover:bg-tint" onClick={() => findInNote(1)} aria-label="Next match">Next</button>
        <span className="text-[10px] text-muted" aria-live="polite">{findQuery.trim() ? `${findMatches(findQuery).length ? findIndex + 1 : 0} match${findMatches(findQuery).length === 1 ? "" : "es"}` : "Type to search"}</span>
      </div>}
      {aiUnavailable && <div className="notespace-note-ui absolute bottom-full left-1/2 z-20 mb-1 max-w-64 -translate-x-1/2 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] text-ink" role="status">
        AI writing actions are unavailable because no approved provider is configured. No document change was made.
        <button type="button" className="ml-1 text-accent underline" onClick={() => setAiUnavailable(false)}>Dismiss</button>
      </div>}
      {referenceQuery !== null && <div className="notespace-note-ui absolute z-10 grid min-w-48 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]" style={{ left: referencePosition.left, top: referencePosition.top }} role="listbox" aria-label="Canvas Note references">
        {referenceResults.length > 0 ? referenceResults.map((result, index) => <div key={`${result.noteId}-${result.workspaceId}`} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${index === referenceIndex % referenceResults.length ? "bg-tint" : ""}`}>
          <button type="button" className="min-w-0 flex-1 truncate px-1 text-left text-ink hover:text-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => applyReference(result)}>{result.excerpt.trim() || "Canvas Note"}</button>
          <button type="button" className="rounded px-1 text-muted hover:bg-surface hover:text-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => applyReference(result, "embed")}>Embed</button>
          {onPlaceLinkedNote && result.noteId && <button type="button" className="rounded px-1 text-muted hover:bg-surface hover:text-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => { void onPlaceLinkedNote(result.noteId!); }}>Place</button>}
        </div>) : <span className="px-2 py-1 text-[10px] text-muted">Type a Note title or ID…</span>}
      </div>}
      {backlinksOpen && <div className="notespace-note-ui absolute left-2 top-9 z-10 grid min-w-52 max-w-72 gap-1 rounded-lg border border-line bg-surface p-2 shadow-[0_8px_20px_rgba(15,23,42,0.14)]" role="region" aria-label="Note backlinks">
        <strong className="text-[10px] text-ink">Backlinks</strong>
        {backlinks.length ? backlinks.map((result) => <a key={`${result.noteId}-${result.workspaceId}`} className="truncate text-[10px] text-accent hover:underline" href={result.workspaceId && result.noteId ? `/workspaces/${encodeURIComponent(result.workspaceId)}?noteId=${encodeURIComponent(result.noteId)}` : undefined}>{result.excerpt.trim() || "Canvas Note"}</a>) : <span className="text-[10px] text-muted">No incoming Note links found.</span>}
      </div>}
      {slash && visibleCommands.length > 0 && <div className="notespace-note-ui absolute z-10 grid min-w-36 gap-0.5 rounded-lg border border-line bg-surface p-1" style={{ left: slashPosition.left, top: slashPosition.top }} role="menu" aria-label="Note slash commands">
        {visibleCommands.map(([label, command], index) => <button key={label} type="button" className={"rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint " + (index === slash.index % visibleCommands.length ? "bg-tint text-accent" : "")} onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(command)}>{label}</button>)}
      </div>}
      <EditorContent editor={editor} />
    </div>
  );
}

function NoteCardStatus({ entry, onRetry }: { entry: Exclude<CanvasNoteEntry, { status: "ready" }>; onRetry: () => void }) {
  if (entry.status === "loading") {
    return <div className="grid content-start gap-2 px-3.5 py-3" aria-busy="true" aria-label="Loading Note">
      <span className="h-2.5 w-3/5 rounded bg-tint" />
      <span className="h-2.5 w-4/5 rounded bg-tint" />
      <span className="h-2.5 w-2/5 rounded bg-tint" />
    </div>;
  }
  if (entry.status === "missing") {
    return <p className="m-0 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="status">This Note is no longer available. Select the card and press Delete to remove it from the Canvas.</p>;
  }
  return <div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="alert">
    <span>{entry.message}</span>
    <button type="button" className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-accent hover:bg-tint" onClick={onRetry}>Retry</button>
  </div>;
}

const saveIndicatorLabel: Partial<Record<NoteSaveState, string>> = {
  pending: "Unsaved changes",
  saving: "Saving",
  error: "Save failed",
  conflict: "Save conflict",
};

function NoteSaveIndicator({ state }: { state: NoteSaveState | undefined }) {
  const label = state ? saveIndicatorLabel[state] : undefined;
  if (!state || !label) return null;
  const failed = state === "error" || state === "conflict";
  // Routine progress stays decorative; recovery actions live in the session save status.
  return <span className={"notespace-note-ui pointer-events-none absolute right-2 top-2 size-1.5 rounded-full " + (failed ? "bg-danger" : "bg-muted/50")} data-note-save={state} title={label} {...(failed ? { role: "img", "aria-label": label } : { "aria-hidden": true })} />;
}

function NoteLabel({ document, zoom, lines }: { document: NoteDocument; zoom: number; lines: 1 | 2 }) {
  const label = noteFirstLine(document);
  return <p className={"m-0 px-3.5 py-2.5 font-semibold leading-tight text-ink " + (lines === 1 ? "truncate" : "line-clamp-2")} style={{ fontSize: noteCardLabelFontSize(zoom) }} data-note-label="">{label}</p>;
}

type CanvasNoteCardProps = {
  element: OrderedExcalidrawElement;
  reference: CanvasNoteReference;
  entry: CanvasNoteEntry;
  saveState: NoteSaveState | undefined;
  workspaceId: string;
  viewport: CanvasViewport;
  selected: boolean;
  editing: boolean;
  documentTool: NoteDocumentTool | null;
  onEditingChange: (elementId: string | null) => void;
  onDocumentChange: (noteId: string, document: NoteDocument) => void;
  onDocumentToolHandled: () => void;
  onRetry: (noteId: string) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onError: (message: string) => void;
};

function NoteCardBody({ entry, editable, folded, detail, zoom, onRetry, renderEditor }: {
  entry: CanvasNoteEntry;
  editable: boolean;
  folded: boolean;
  detail: NoteCardDetail;
  zoom: number;
  onRetry: () => void;
  renderEditor: (note: Note) => ReactNode;
}) {
  if (entry.status !== "ready") return <NoteCardStatus entry={entry} onRetry={onRetry} />;
  if (editable) return renderEditor(entry.note);
  if (folded) return <NoteLabel document={entry.note.document} zoom={zoom} lines={1} />;
  if (detail === "label") return <NoteLabel document={entry.note.document} zoom={zoom} lines={2} />;
  return <NoteReadView document={entry.note.document} />;
}

function CanvasNoteCard({ element, reference, entry, saveState, workspaceId, viewport, selected, editing, documentTool, onEditingChange, onDocumentChange, onDocumentToolHandled, onRetry, onAutoResize, onPlaceLinkedNote, onError }: CanvasNoteCardProps) {
  // `compact` is the persisted instance flag; the user-facing command is Fold.
  const folded = reference.compact === true;
  const editable = editing && entry.status === "ready";
  const collapsed = folded && !editable;
  const frame = noteCardFrame(element, viewport, collapsed);
  const style = { ...frame, "--note-ui-scale": noteCardUiScale(viewport.zoom) } as CSSProperties;
  const frameClass = "absolute rounded-lg border bg-surface text-ink "
    + (collapsed ? "overflow-hidden " : "overflow-visible ")
    + (selected || editable ? "border-accent/70 ring-2 ring-accent/15" : "border-line")
    + (editable ? " pointer-events-auto" : " pointer-events-none");
  return <article className={frameClass} style={style} data-note-element={element.id} data-note-compact={folded || undefined} data-note-state={entry.status} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onEditingChange(null); }}>
    <NoteCardBody
      entry={entry}
      editable={editable}
      folded={collapsed}
      detail={noteCardDetail(viewport.zoom, editable)}
      zoom={viewport.zoom}
      onRetry={() => onRetry(reference.noteId)}
      renderEditor={(note) => <NoteEditor note={note} elementId={element.id} workspaceId={workspaceId} documentTool={documentTool} onDocumentToolHandled={onDocumentToolHandled} onDocumentChange={(document) => onDocumentChange(note.id, document)} onAutoResize={onAutoResize} onPlaceLinkedNote={onPlaceLinkedNote} onError={onError} onEscape={() => onEditingChange(null)} />}
    />
    <NoteSaveIndicator state={saveState} />
  </article>;
}

const ignoreAutoResize = () => {};
const ignoreDocumentToolHandled = () => {};

export function CanvasNoteCardLayer({
  elements, workspaceId, viewport, selectedElementId, editingElementId, onEditingChange, onRegisterFlush, onUpdateNote, onSaveState, onAutoResize, onPlaceLinkedNote, documentRequest, onDocumentRequestHandled, onError,
}: {
  elements: readonly OrderedExcalidrawElement[];
  workspaceId: string;
  viewport: CanvasViewport;
  selectedElementId: string | null;
  editingElementId: string | null;
  onEditingChange: (elementId: string | null) => void;
  onRegisterFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onUpdateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  onSaveState?: (status: NoteSaveStatus) => void;
  onAutoResize?: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  documentRequest?: { elementId: string; tool: NoteDocumentTool } | null;
  onDocumentRequestHandled?: () => void;
  onError: (message: string) => void;
}) {
  const store = useCanvasNoteStore({ updateNote: onUpdateNote });
  const snapshot = useCanvasNoteSnapshot(store);
  const noteElements = useMemo(() => elements.flatMap((element) => {
    const reference = readCanvasNoteReference(element);
    return reference ? [{ element, reference }] : [];
  }), [elements]);

  useEffect(() => {
    store.ensure(noteElements.map(({ reference }) => reference.noteId));
  }, [noteElements, store]);
  useEffect(() => { onSaveState?.(snapshot.save); }, [onSaveState, snapshot.save]);
  useEffect(() => onRegisterFlush?.(() => store.flushAll()), [onRegisterFlush, store]);

  return <CanvasNoteStoreProvider value={store}>
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-visible" aria-label="Canvas notes">
      {noteElements.map(({ element, reference }) => <CanvasNoteCard
        key={element.id}
        element={element}
        reference={reference}
        entry={snapshot.entries[reference.noteId] ?? { status: "loading" }}
        saveState={snapshot.saves[reference.noteId]}
        workspaceId={workspaceId}
        viewport={viewport}
        selected={selectedElementId === element.id}
        editing={editingElementId === element.id}
        documentTool={documentRequest?.elementId === element.id ? documentRequest.tool : null}
        onEditingChange={onEditingChange}
        onDocumentChange={store.queue}
        onDocumentToolHandled={onDocumentRequestHandled ?? ignoreDocumentToolHandled}
        onRetry={store.retry}
        onAutoResize={onAutoResize ?? ignoreAutoResize}
        onPlaceLinkedNote={onPlaceLinkedNote}
        onError={onError}
      />)}
    </div>
  </CanvasNoteStoreProvider>;
}
