import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Mathematics from "@tiptap/extension-mathematics";
import { Markdown } from "@tiptap/markdown";
import "katex/dist/katex.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getNote, listNoteBacklinks, type Note } from "../../../../adapters/http/note-api";
import { searchNotespace, type SearchResult } from "../../../../adapters/http/workspace-api";
import { APIError } from "../../../../adapters/http/client";
import { storeImageAsset } from "../../../../adapters/assets/image-store";
import { ensureNoteBlockIds, NoteBlockIdentity, NoteBlockReference, NoteCallout, NoteEmbed, NoteImage } from "./note-extensions";
import { sanitizePastedHTML } from "./note-sanitize";
import { readCanvasNoteReference, type NoteDocument } from "../../../../domain/note/note";

type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };
export type NoteSaveState = "saved" | "pending" | "saving" | "error" | "conflict";
export type NoteSaveStatus = { state: NoteSaveState; message?: string; recover?: () => Promise<void> };

export function CanvasNoteActions({ compact, onEdit, onToggleCompact, onDuplicate, onDelete }: {
  compact: boolean;
  onEdit: () => void;
  onToggleCompact: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  return <div className="notespace-note-actions pointer-events-auto relative z-[1] flex w-fit items-center gap-0.5 rounded-lg border border-line bg-surface p-1" role="toolbar" aria-label="Canvas Note actions">
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={onEdit}>Edit</button>
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={onToggleCompact}>{compact ? "Expand" : "Compact"}</button>
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" aria-expanded={more} onClick={() => setMore((value) => !value)}>More</button>
    {more && <div className="absolute right-0 top-full mt-1 grid min-w-28 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]">
      <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={onDuplicate}>Duplicate</button>
      <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-danger hover:bg-tint" onClick={onDelete}>Remove instance</button>
    </div>}
  </div>;
}

const isSafeNoteLink = (url: string) => /^\/workspaces\/[^/]+(?:[?#/].*)?$/i.test(url) || /^https?:\/\//i.test(url);

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
  onDocumentChange: (document: NoteDocument) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onError: (message: string) => void;
  onEscape: () => void;
}) {
  const { note, elementId, workspaceId, onDocumentChange, onAutoResize, onPlaceLinkedNote, onError, onEscape } = props;
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
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
  const editor = useEditor({
    extensions: [
      StarterKit,
      NoteImage,
      NoteEmbed,
      NoteBlockReference,
      NoteCallout,
      NoteBlockIdentity,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ["http", "https"], isAllowedUri: (url, context) => isSafeNoteLink(url) && (url.startsWith("/") || context.defaultValidate(url)) }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics.configure({ katexOptions: { throwOnError: false, strict: false } }),
      Markdown,
    ],
    content: note.document,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "min-h-[116px] px-3 py-2 text-[13px] leading-5 text-ink outline-none", "aria-label": "Note content" },
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
      handleKeyDown: (_view, event) => {
        if (event.key === "/" && !event.shiftKey) {
          setSlashOpen(true); setSlashQuery(""); setSlashIndex(0);
        } else if (slashOpen && event.key === "ArrowDown") {
          event.preventDefault(); setSlashIndex((value) => value + 1); return true;
        } else if (slashOpen && event.key === "ArrowUp") {
          event.preventDefault(); setSlashIndex((value) => Math.max(0, value - 1)); return true;
        } else if (slashOpen && event.key === "Backspace") {
          setSlashQuery((value) => value.slice(0, -1));
        } else if (slashOpen && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          setSlashQuery((value) => value + event.key); setSlashIndex(0);
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
        if (slashOpen) { setSlashOpen(false); setSlashQuery(""); return true; }
        onEscape();
        return true;
      },
    },
    onUpdate: ({ editor: value }) => {
      onDocumentChange(value.getJSON() as NoteDocument);
      const beforeCaret = value.state.doc.textBetween(0, value.state.selection.from, "\n");
      const match = beforeCaret.match(/\[\[([^\]]*)$/);
      setReferenceQuery(match ? match[1] ?? "" : null);
      if (match) setReferenceIndex(0);
    },
    onSelectionUpdate: ({ editor: value }) => setHasTextSelection(!value.state.selection.empty),
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
  const visibleCommands = commands.filter(([label]) => label.toLowerCase().includes(slashQuery.toLowerCase()));
  const runSlashCommand = (command: () => void) => {
    const position = editor.state.selection.from;
    editor.chain().focus().deleteRange({ from: Math.max(1, position - slashQuery.length - 1), to: position }).run();
    command(); setSlashOpen(false); setSlashQuery("");
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
  return (
    <div className="relative">
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
      {hasTextSelection && <div className="absolute bottom-full left-1/2 z-20 mb-1 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="toolbar" aria-label="Note formatting">
        {[
          ["Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold")],
          ["Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic")],
          ["Code", () => editor.chain().focus().toggleCode().run(), editor.isActive("code")],
          ["Underline", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline")],
          ["Bulleted list", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList")],
          ["Checklist", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList")],
          ["Heading", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 })],
          ["Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote")],
          ["Callout", () => editor.chain().focus().wrapIn("noteCallout", { tone: "note" }).run(), editor.isActive("noteCallout")],
          ["Table", () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(), false],
          ["Math", () => editor.chain().focus().insertInlineMath({ latex: "x^2" }).run(), false],
          ["Export .md", exportMarkdown, false],
          ["Import .md", () => importInputRef.current?.click(), false],
          ["Image", () => imageInputRef.current?.click(), false],
          ["Find", () => { setFindOpen((value) => !value); setFindIndex(0); }, false],
          ["Backlinks", () => setBacklinksOpen((value) => !value), false],
          ["Undo", () => editor.chain().focus().undo().run(), false],
          ["Redo", () => editor.chain().focus().redo().run(), false],
        ].map(([label, command, active]) => <button key={String(label)} type="button" className={"rounded px-1.5 py-1 text-[10px] " + (active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink")} aria-label={String(label)} aria-pressed={Boolean(active)} onMouseDown={(event) => event.preventDefault()} onClick={() => (command as () => void)()}>{String(label)}</button>)}
        {editor.isActive("table") && <>
          <button type="button" className="rounded px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Row +</button>
          <button type="button" className="rounded px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Column +</button>
          <button type="button" className="rounded px-1.5 py-1 text-[10px] text-danger hover:bg-tint" aria-label="Delete table" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
        </>}
        <input className="ml-1 h-6 min-w-0 flex-1 rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent" value={linkURL} onChange={(event) => setLinkURL(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setLink(); } }} placeholder="Link URL or /workspaces/id?noteId=..." aria-label="Link URL" />
        <button type="button" className="rounded px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="AI writing actions unavailable" title="AI writing actions are unavailable until a configured provider is enabled" onMouseDown={(event) => event.preventDefault()} onClick={() => setAiUnavailable(true)}>AI</button>
      </div>}
      {findOpen && <div className="absolute bottom-full left-1/2 z-20 mb-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1" role="search" aria-label="Find in Note">
        <input autoFocus className="h-6 w-32 rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent" value={findQuery} onChange={(event) => { setFindQuery(event.target.value); setFindIndex(0); }} placeholder="Find in Note" aria-label="Find in Note query" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); findInNote(event.shiftKey ? -1 : 1); } }} />
        <button type="button" className="rounded px-1 py-1 text-[10px] text-muted hover:bg-tint" onClick={() => findInNote(-1)} aria-label="Previous match">Prev</button>
        <button type="button" className="rounded px-1 py-1 text-[10px] text-muted hover:bg-tint" onClick={() => findInNote(1)} aria-label="Next match">Next</button>
        <span className="text-[10px] text-muted" aria-live="polite">{findQuery.trim() ? `${findMatches(findQuery).length ? findIndex + 1 : 0} match${findMatches(findQuery).length === 1 ? "" : "es"}` : "Type to search"}</span>
      </div>}
      {aiUnavailable && <div className="absolute bottom-full left-1/2 z-20 mb-1 max-w-64 -translate-x-1/2 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] text-ink" role="status">
        AI writing actions are unavailable because no approved provider is configured. No document change was made.
        <button type="button" className="ml-1 text-accent underline" onClick={() => setAiUnavailable(false)}>Dismiss</button>
      </div>}
      {referenceQuery !== null && <div className="absolute left-2 top-9 z-10 grid min-w-48 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]" role="listbox" aria-label="Canvas Note references">
        {referenceResults.length > 0 ? referenceResults.map((result, index) => <div key={`${result.noteId}-${result.workspaceId}`} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${index === referenceIndex % referenceResults.length ? "bg-tint" : ""}`}>
          <button type="button" className="min-w-0 flex-1 truncate px-1 text-left text-ink hover:text-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => applyReference(result)}>{result.excerpt.trim() || "Canvas Note"}</button>
          <button type="button" className="rounded px-1 text-muted hover:bg-surface hover:text-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => applyReference(result, "embed")}>Embed</button>
          {onPlaceLinkedNote && result.noteId && <button type="button" className="rounded px-1 text-muted hover:bg-surface hover:text-accent" onMouseDown={(event) => event.preventDefault()} onClick={() => { void onPlaceLinkedNote(result.noteId!); }}>Place</button>}
        </div>) : <span className="px-2 py-1 text-[10px] text-muted">Type a Note title or ID…</span>}
      </div>}
      {backlinksOpen && <div className="absolute left-2 top-9 z-10 grid min-w-52 max-w-72 gap-1 rounded-lg border border-line bg-surface p-2 shadow-[0_8px_20px_rgba(15,23,42,0.14)]" role="region" aria-label="Note backlinks">
        <strong className="text-[10px] text-ink">Backlinks</strong>
        {backlinks.length ? backlinks.map((result) => <a key={`${result.noteId}-${result.workspaceId}`} className="truncate text-[10px] text-accent hover:underline" href={result.workspaceId && result.noteId ? `/workspaces/${encodeURIComponent(result.workspaceId)}?noteId=${encodeURIComponent(result.noteId)}` : undefined}>{result.excerpt.trim() || "Canvas Note"}</a>) : <span className="text-[10px] text-muted">No incoming Note links found.</span>}
      </div>}
      {slashOpen && visibleCommands.length > 0 && <div className="absolute left-2 top-9 z-10 grid min-w-36 gap-0.5 rounded-lg border border-line bg-surface p-1" role="menu" aria-label="Note slash commands">
        {visibleCommands.map(([label, command], index) => <button key={label} type="button" className={"rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint " + (index === slashIndex % visibleCommands.length ? "bg-tint text-accent" : "")} onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(command)}>{label}</button>)}
      </div>}
      <EditorContent editor={editor} />
    </div>
  );
}

export function CanvasNoteCardLayer({
  elements, workspaceId, viewport, selectedElementId, editingElementId, onEditingChange, onRegisterFlush, onUpdateNote, onSaveState, onAutoResize, onPlaceLinkedNote, onError,
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
  onError: (message: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const pending = useRef(new Map<string, { document?: NoteDocument; revision: number; timer?: number; inFlight?: Promise<void> }>());
  const saveStates = useRef(new Map<string, NoteSaveStatus>());
  const reportSaveState = useCallback((noteId: string, status: NoteSaveStatus) => {
    saveStates.current.set(noteId, status);
    const statuses = [...saveStates.current.values()];
    onSaveState?.(statuses.find((value) => value.state === "conflict") ?? statuses.find((value) => value.state === "error") ?? statuses.find((value) => value.state === "saving") ?? statuses.find((value) => value.state === "pending") ?? { state: "saved" });
  }, [onSaveState]);
  const noteElements = useMemo(() => elements.flatMap((element) => {
    const reference = readCanvasNoteReference(element);
    return reference ? [{ element, reference }] : [];
  }), [elements]);

  useEffect(() => {
    let cancelled = false;
    const missing = noteElements.map(({ reference }) => reference.noteId).filter((id, index, all) => !notes[id] && all.indexOf(id) === index);
    if (!missing.length) return undefined;
    void Promise.all(missing.map(async (id) => {
      try { return await getNote(id); }
      catch (error) { onError(error instanceof Error ? error.message : "Could not load this Note."); return null; }
    })).then((values) => {
      if (!cancelled) setNotes((current) => Object.fromEntries([...Object.entries(current), ...values.filter((value): value is Note => Boolean(value)).map((value) => [value.id, value])]));
    });
    return () => { cancelled = true; };
  }, [noteElements, notes, onError]);

  const recoverNote = useCallback(async (noteId: string) => {
    const entry = pending.current.get(noteId);
    if (!entry?.document) return;
    reportSaveState(noteId, { state: "saving" });
    try {
      const latest = await getNote(noteId);
      const saved = await onUpdateNote(noteId, entry.document, latest.revision);
      entry.revision = saved.revision;
      entry.document = undefined;
      pending.current.delete(noteId);
      setNotes((current) => ({ ...current, [noteId]: saved }));
      reportSaveState(noteId, { state: "saved" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not recover this Note.";
      reportSaveState(noteId, {
        state: error instanceof APIError && error.status === 409 ? "conflict" : "error",
        message,
        recover: () => recoverNote(noteId),
      });
      throw error;
    }
  }, [onUpdateNote, reportSaveState]);

  const flushNote = useCallback(async (noteId: string) => {
    const entry = pending.current.get(noteId);
    if (!entry) return;
    if (entry.timer !== undefined) window.clearTimeout(entry.timer);
    if (entry.inFlight) return entry.inFlight;
    entry.inFlight = (async () => {
      reportSaveState(noteId, { state: "saving" });
      while (entry.document) {
        const document = entry.document; entry.document = undefined;
        try {
          const saved = await onUpdateNote(noteId, document, entry.revision);
          entry.revision = saved.revision;
          setNotes((current) => ({ ...current, [noteId]: saved }));
        } catch (error) { entry.document = document; throw error; }
      }
      pending.current.delete(noteId);
      reportSaveState(noteId, { state: "saved" });
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Could not save this Note.";
      reportSaveState(noteId, {
        state: error instanceof APIError && error.status === 409 ? "conflict" : "error",
        message,
        ...(error instanceof APIError && error.status === 409 ? { recover: () => recoverNote(noteId) } : {}),
      });
      throw error;
    }).finally(() => {
      const current = pending.current.get(noteId);
      if (current) current.inFlight = undefined;
    });
    return entry.inFlight;
  }, [onUpdateNote, recoverNote, reportSaveState]);

  const queueNoteUpdate = useCallback((noteId: string, document: NoteDocument) => {
    const current = notes[noteId];
    if (!current) return;
    const entry = pending.current.get(noteId) ?? { revision: current.revision };
    entry.document = document; entry.revision = entry.revision || current.revision;
    if (entry.timer !== undefined) window.clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => { void flushNote(noteId).catch((error: unknown) => onError(error instanceof Error ? error.message : "Could not save this Note.")); }, 350);
    pending.current.set(noteId, entry);
    reportSaveState(noteId, { state: "pending" });
    setNotes((value) => ({ ...value, [noteId]: { ...value[noteId], document } }));
  }, [flushNote, notes, onError, reportSaveState]);

  useEffect(() => onRegisterFlush?.(async () => {
    await Promise.all([...pending.current.keys()].map((id) => flushNote(id)));
  }), [flushNote, onRegisterFlush]);

  return <div className="pointer-events-none absolute inset-0 z-[5] overflow-visible" aria-label="Canvas notes">
    {noteElements.map(({ element, reference }) => {
      const note = notes[reference.noteId];
      if (!note) return null;
      const editing = editingElementId === element.id;
      const selected = selectedElementId === element.id;
      const compact = reference.compact === true;
      return <article key={element.id} className={"absolute overflow-visible rounded-xl border bg-surface/95 shadow-[0_10px_28px_rgba(15,23,42,0.12)] " + (selected ? "border-accent/60 ring-2 ring-accent/15" : "border-line") + (editing ? " pointer-events-auto" : " pointer-events-none")} style={{ left: (element.x + viewport.scrollX) * viewport.zoom, top: (element.y + viewport.scrollY) * viewport.zoom, width: element.width * viewport.zoom, height: compact && !editing ? 180 * viewport.zoom : undefined, minHeight: compact && !editing ? 0 : element.height * viewport.zoom }} data-note-element={element.id} data-note-compact={compact || undefined} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onEditingChange(null); }}>
        {editing ? <NoteEditor note={note} elementId={element.id} workspaceId={workspaceId} onDocumentChange={(document) => queueNoteUpdate(note.id, document)} onAutoResize={onAutoResize ?? (() => {})} onPlaceLinkedNote={onPlaceLinkedNote} onError={onError} onEscape={() => onEditingChange(null)} /> : <p className={"min-h-[116px] whitespace-pre-wrap px-3 py-2 text-[13px] leading-5 text-ink/85 " + (compact ? "max-h-[180px] overflow-hidden" : "")}>{previewText(note.document) || "Empty note"}</p>}
      </article>;
    })}
  </div>;
}
