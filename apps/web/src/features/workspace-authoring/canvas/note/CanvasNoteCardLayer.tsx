import { EditorContent, useEditor } from "@tiptap/react";
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
import { getNote, type Note } from "../../../../adapters/http/note-api";
import { readCanvasNoteReference, type NoteDocument } from "../../../../domain/note/note";

type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };

function previewText(document: NoteDocument): string {
  const walk = (nodes: NoteDocument["content"]): string[] => nodes.flatMap((node) => [
    ...(node.text ? [node.text] : []),
    ...(node.content ? walk(node.content) : []),
  ]);
  return walk(document.content).join(" ").trim();
}

function NoteEditor({
  note,
  onDocumentChange,
  onEscape,
}: {
  note: Note;
  onDocumentChange: (document: NoteDocument) => void;
  onEscape: () => void;
}) {
  const [slashOpen, setSlashOpen] = useState(false);
  const [linkURL, setLinkURL] = useState("");
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ["http", "https"] }), Underline, TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Mathematics.configure({ katexOptions: { throwOnError: false, strict: false } }), Markdown],
    content: note.document,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "min-h-[116px] px-3 py-2 text-[13px] leading-5 text-ink outline-none",
        "aria-label": "Note content",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "/" && !event.shiftKey) setSlashOpen(true);
        if (event.key !== "Escape") return false;
        event.preventDefault();
        if (slashOpen) {
          setSlashOpen(false);
          return true;
        }
        onEscape();
        return true;
      },
    },
    onUpdate: ({ editor: value }) => onDocumentChange(value.getJSON() as NoteDocument),
    onSelectionUpdate: ({ editor: value }) => setHasTextSelection(!value.state.selection.empty),
    onCreate: ({ editor: value }) => { if (typeof window !== "undefined") window.requestAnimationFrame(() => value.commands.focus("end")); },
  });

  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(note.document)) {
      editor.commands.setContent(note.document, { emitUpdate: false });
    }
  }, [editor, note.document]);

  if (!editor) return null;
  const runSlashCommand = (command: () => void) => {
    const position = editor.state.selection.from;
    editor.chain().focus().deleteRange({ from: Math.max(1, position - 1), to: position }).run();
    command();
    setSlashOpen(false);
  };
  const setLink = () => {
    const href = linkURL.trim();
    if (href) editor.chain().focus().setLink({ href }).run();
    setLinkURL("");
  };
  const exportMarkdown = () => {
    const blob = new Blob([editor.getMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `note-${note.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const markdown = await file.text();
    editor.commands.setContent(markdown, { contentType: "markdown" });
  };
  return (
    <div className="relative">
      <input ref={importInputRef} type="file" accept=".md,text/markdown" className="hidden" onChange={(event) => { void importMarkdown(event); }} aria-label="Import Markdown" />
      {hasTextSelection && (
      <div className="absolute bottom-full left-2 z-20 mb-1 flex max-w-[calc(100%-16px)] flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface px-2 py-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]" role="toolbar" aria-label="Note formatting">
        {[
          ["Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold")],
          ["Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic")],
          ["Code", () => editor.chain().focus().toggleCode().run(), editor.isActive("code")],
          ["Underline", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline")],
          ["Bulleted list", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList")],
          ["Checklist", () => editor.chain().focus().toggleTaskList().run(), editor.isActive("taskList")],
          ["Heading", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 })],
          ["Quote", () => editor.chain().focus().toggleBlockquote().run(), editor.isActive("blockquote")],
          ["Table", () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(), false],
          ["Math", () => editor.chain().focus().insertInlineMath({ latex: "x^2" }).run(), false],
          ["Export .md", exportMarkdown, false],
          ["Import .md", () => importInputRef.current?.click(), false],
          ["Undo", () => editor.chain().focus().undo().run(), false],
          ["Redo", () => editor.chain().focus().redo().run(), false],
        ].map(([label, command, active]) => (
          <button key={String(label)} type="button" className={`rounded px-1.5 py-1 text-[10px] ${active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink"}`} aria-label={String(label)} aria-pressed={Boolean(active)} onMouseDown={(event) => event.preventDefault()} onClick={() => (command as () => void)()}>{String(label)}</button>
        ))}
        <input className="ml-1 h-6 min-w-0 flex-1 rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent" value={linkURL} onChange={(event) => setLinkURL(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setLink(); } }} placeholder="Link URL" aria-label="Link URL" />
      </div>
      )}
      {slashOpen && (
        <div className="absolute left-2 top-9 z-10 grid min-w-36 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]" role="menu" aria-label="Note slash commands">
          <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>Heading</button>
          <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(() => editor.chain().focus().toggleBulletList().run())}>Bullet list</button>
          <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(() => editor.chain().focus().toggleTaskList().run())}>Checklist</button>
          <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onMouseDown={(event) => event.preventDefault()} onClick={() => runSlashCommand(() => editor.chain().focus().toggleCodeBlock().run())}>Code block</button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

export function CanvasNoteCardLayer({
  elements,
  viewport,
  selectedElementId,
  editingElementId,
  onEditingChange,
  onRegisterFlush,
  onUpdateNote,
  onError,
}: {
  elements: readonly OrderedExcalidrawElement[];
  viewport: CanvasViewport;
  selectedElementId: string | null;
  editingElementId: string | null;
  onEditingChange: (elementId: string | null) => void;
  onRegisterFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onUpdateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  onError: (message: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const pending = useRef(new Map<string, { document?: NoteDocument; revision: number; timer?: number; inFlight?: Promise<void> }>());
  const noteElements = useMemo(() => elements.flatMap((element) => {
    const reference = readCanvasNoteReference(element);
    return reference ? [{ element, reference }] : [];
  }), [elements]);

  useEffect(() => {
    let cancelled = false;
    const missing = noteElements.map(({ reference }) => reference.noteId).filter((id, index, all) => !notes[id] && all.indexOf(id) === index);
    if (missing.length === 0) return undefined;
    void Promise.all(missing.map(async (id) => {
      try {
        return await getNote(id);
      } catch (error) {
        onError(error instanceof Error ? error.message : "Could not load this Note.");
        return null;
      }
    })).then((values) => {
      if (cancelled) return;
      setNotes((current) => Object.fromEntries([
        ...Object.entries(current),
        ...values.filter((value): value is Note => Boolean(value)).map((value) => [value.id, value]),
      ]));
    });
    return () => { cancelled = true; };
  }, [noteElements, notes, onError]);

  const flushNote = useCallback(async (noteId: string) => {
    const entry = pending.current.get(noteId);
    if (!entry) return;
    if (entry.timer !== undefined) window.clearTimeout(entry.timer);
    if (entry.inFlight) return entry.inFlight;
    entry.inFlight = (async () => {
      while (entry.document) {
        const document = entry.document;
        entry.document = undefined;
        try {
          const saved = await onUpdateNote(noteId, document, entry.revision);
          entry.revision = saved.revision;
          setNotes((current) => ({ ...current, [noteId]: saved }));
        } catch (error) {
          entry.document = document;
          throw error;
        }
      }
      pending.current.delete(noteId);
    })().finally(() => {
      const current = pending.current.get(noteId);
      if (current) current.inFlight = undefined;
    });
    return entry.inFlight;
  }, [onUpdateNote]);

  const queueNoteUpdate = useCallback((noteId: string, document: NoteDocument) => {
    const current = notes[noteId];
    if (!current) return;
    const entry = pending.current.get(noteId) ?? { revision: current.revision };
    entry.document = document;
    entry.revision = entry.revision || current.revision;
    if (entry.timer !== undefined) window.clearTimeout(entry.timer);
    entry.timer = window.setTimeout(() => { void flushNote(noteId).catch((error: unknown) => onError(error instanceof Error ? error.message : "Could not save this Note.")); }, 350);
    pending.current.set(noteId, entry);
    setNotes((value) => ({ ...value, [noteId]: { ...value[noteId], document } }));
  }, [flushNote, notes, onError]);

  useEffect(() => onRegisterFlush?.(async () => {
    await Promise.all([...pending.current.keys()].map((id) => flushNote(id)));
  }), [flushNote, onRegisterFlush]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-label="Canvas notes">
      {noteElements.map(({ element, reference }) => {
        const note = notes[reference.noteId];
        if (!note) return null;
        const editing = editingElementId === element.id;
        const selected = selectedElementId === element.id;
        return (
          <article
            key={element.id}
            className={`absolute overflow-visible rounded-xl border bg-surface/95 shadow-[0_10px_28px_rgba(15,23,42,0.12)] ${selected ? "border-accent/60 ring-2 ring-accent/15" : "border-line"} ${editing ? "pointer-events-auto" : "pointer-events-none"}`}
            style={{ left: (element.x + viewport.scrollX) * viewport.zoom, top: (element.y + viewport.scrollY) * viewport.zoom, width: element.width * viewport.zoom, minHeight: element.height * viewport.zoom }}
            data-note-element={element.id}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key === "Escape") onEditingChange(null); }}
          >
            {editing ? (
              <NoteEditor note={note} onDocumentChange={(document) => queueNoteUpdate(note.id, document)} onEscape={() => onEditingChange(null)} />
            ) : (
              <p className="min-h-[116px] whitespace-pre-wrap px-3 py-2 text-[13px] leading-5 text-ink/85">{previewText(note.document) || "Empty note"}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
