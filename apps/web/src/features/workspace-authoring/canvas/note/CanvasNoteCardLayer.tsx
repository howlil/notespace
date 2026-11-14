import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import "katex/dist/katex.min.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Note } from "../../../../adapters/http/note-api";
import { searchNotespace, type SearchResult } from "../../../../adapters/http/workspace-api";
import { storeImageAsset } from "../../../../adapters/assets/image-store";
import { createNoteExtensions, ensureNoteBlockIds } from "./note-extensions";
import { renderNoteLatex } from "./note-math";
import { sanitizePastedHTML } from "./note-sanitize";
import { isSafeNoteLink, noteFirstLine, readCanvasNoteReference, type CanvasNoteReference, type NoteDocument } from "../../../../domain/note/note";
import type { CanvasNoteEntry, NoteSaveState, NoteSaveStatus } from "./canvas-note-store";
import {
  NOTE_CARD_MIN_HEIGHT,
  noteCardBodyMaxHeight,
  noteCardDetail,
  noteCardFrame,
  noteCardLabelFontSize,
  noteCardUiScale,
  type NoteCardDetail,
} from "./note-card-layout";
import { noteSlashQuery } from "./note-slash";
import { NoteReadView } from "./NoteReadView";
import { CanvasNoteStoreProvider, useCanvasNoteSnapshot, useCanvasNoteStore } from "./use-canvas-note-store";

type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };
export type NoteActivationPoint = { clientX: number; clientY: number };

export function CanvasNoteActions({
  folded,
  fixedHeight,
  onEdit,
  onToggleFold,
  onFitContent,
  onPlaceLinked,
  onDuplicate,
  onDelete,
}: {
  folded: boolean;
  fixedHeight?: boolean;
  onEdit: () => void;
  onToggleFold: () => void;
  onFitContent?: () => void;
  onPlaceLinked?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  return <div className="notespace-note-actions pointer-events-auto relative z-[1] flex w-fit items-center gap-0.5 rounded-lg border border-line bg-surface p-1" role="toolbar" aria-label="Canvas Note actions">
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={onEdit}>Edit</button>
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" onClick={onToggleFold}>{folded ? "Unfold" : "Fold"}</button>
    <button type="button" className="rounded px-2 py-1 text-[10px] text-muted hover:bg-tint hover:text-accent" aria-expanded={more} onClick={() => setMore((value) => !value)}>More</button>
    {more && <div className="absolute right-0 top-full mt-1 grid min-w-40 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]">
      {fixedHeight && onFitContent && (
        <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onFitContent(); }}>Fit content</button>
      )}
      <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onDuplicate(); }}>Duplicate</button>
      {onPlaceLinked && (
        <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onPlaceLinked(); }}>Place linked</button>
      )}
      <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-danger hover:bg-tint" onClick={() => { setMore(false); onDelete(); }}>Remove instance</button>
    </div>}
  </div>;
}

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

function focusEditorAtPoint(value: Editor, point: NoteActivationPoint | null | undefined) {
  if (point) {
    const hit = value.view.posAtCoords({ left: point.clientX, top: point.clientY });
    if (hit && Number.isInteger(hit.pos)) {
      value.commands.focus(hit.pos);
      return;
    }
  }
  value.commands.focus("end");
}

type ReferenceState = {
  query: string;
  mode: "bracket" | "slash-embed";
  position: CaretPosition;
};

type MathPromptState = {
  latex: string;
  block: boolean;
  error: string | null;
  position: CaretPosition;
};

function NoteFormattingToolbar({
  editor,
  position,
  linkURL,
  onLinkURLChange,
  onApplyLink,
  onUnlink,
}: {
  editor: Editor;
  position: CaretPosition;
  linkURL: string;
  onLinkURLChange: (value: string) => void;
  onApplyLink: () => void;
  onUnlink: () => void;
}) {
  const linkActive = editor.isActive("link");
  const top = Math.max(-40, position.top - 44);
  return (
    <div
      className="notespace-note-ui absolute left-1/2 z-20 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface px-2 py-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ top }}
      role="toolbar"
      aria-label="Note formatting"
    >
      {[
        ["Bold", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold")],
        ["Italic", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic")],
        ["Underline", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline")],
        ["Strike", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike")],
        ["Code", () => editor.chain().focus().toggleCode().run(), editor.isActive("code")],
      ].map(([label, command, active]) => (
        <button
          key={String(label)}
          type="button"
          className={"rounded px-1.5 py-1 text-[10px] " + (active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink")}
          aria-label={String(label)}
          aria-pressed={Boolean(active)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (command as () => void)()}
        >
          {String(label)}
        </button>
      ))}
      <input
        className="ml-1 h-6 min-w-28 flex-1 rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent"
        value={linkURL}
        onChange={(event) => onLinkURLChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApplyLink();
          }
        }}
        placeholder="Link URL or /workspaces/id?noteId=..."
        aria-label="Link URL"
      />
      {linkActive && (
        <button
          type="button"
          className="rounded px-1.5 py-1 text-[10px] text-danger hover:bg-tint"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onUnlink}
        >
          Unlink
        </button>
      )}
    </div>
  );
}

function NoteTableToolbar({ editor }: { editor: Editor }) {
  return (
    <div
      className="notespace-note-ui absolute bottom-full left-2 z-20 mb-1 flex items-center gap-0.5 rounded-lg border border-line bg-surface px-1.5 py-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
      role="toolbar"
      aria-label="Note table actions"
    >
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Row +</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Column +</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-danger hover:bg-tint" aria-label="Delete table" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</button>
    </div>
  );
}

function NoteMathPrompt({
  prompt,
  onChange,
  onSubmit,
  onCancel,
}: {
  prompt: MathPromptState;
  onChange: (patch: Partial<MathPromptState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="notespace-note-ui absolute z-20 grid min-w-56 gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
      style={{ left: prompt.position.left, top: prompt.position.top }}
      role="dialog"
      aria-label="Insert Math formula"
    >
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className="h-6 min-w-0 flex-1 rounded border border-line bg-canvas px-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent"
          value={prompt.latex}
          onChange={(event) => onChange({ latex: event.target.value, error: null })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder="e.g. x^2 + y^2 = z^2"
          aria-label="LaTeX formula"
        />
        <button
          type="button"
          className={"rounded border px-1.5 py-0.5 text-[10px] " + (prompt.block ? "border-accent bg-tint text-accent" : "border-line text-muted hover:text-ink")}
          aria-pressed={prompt.block}
          onClick={() => onChange({ block: !prompt.block, error: null })}
        >
          Block
        </button>
      </div>
      {prompt.error && (
        <p className="m-0 text-[10px] text-danger" role="alert">{prompt.error}</p>
      )}
      <div className="flex justify-end gap-1">
        <button type="button" className="rounded px-2 py-0.5 text-[10px] text-muted hover:bg-tint" onClick={onCancel}>Cancel</button>
        <button type="button" className="rounded bg-accent px-2 py-0.5 text-[10px] text-surface" onClick={onSubmit}>Insert</button>
      </div>
    </div>
  );
}

function NoteEditor(props: {
  note: Note;
  elementId: string;
  workspaceId: string;
  activationPoint?: NoteActivationPoint | null;
  bodyMaxHeight?: number;
  onDocumentChange: (document: NoteDocument) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onError: (message: string) => void;
  onEscape: () => void;
}) {
  const { note, elementId, workspaceId, activationPoint, bodyMaxHeight, onDocumentChange, onAutoResize, onPlaceLinkedNote, onError, onEscape } = props;
  const [slash, setSlash] = useState<{ query: string; index: number } | null>(null);
  const [slashPosition, setSlashPosition] = useState<CaretPosition>(FALLBACK_POSITION);
  const [selectionPosition, setSelectionPosition] = useState<CaretPosition>(FALLBACK_POSITION);
  const [linkURL, setLinkURL] = useState("");
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [inTable, setInTable] = useState(false);
  const [referenceState, setReferenceState] = useState<ReferenceState | null>(null);
  const [referenceResults, setReferenceResults] = useState<SearchResult[]>([]);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [mathPrompt, setMathPrompt] = useState<MathPromptState | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const appliedNoteIdRef = useRef(note.id);
  const appliedRevisionRef = useRef(note.revision);
  const activationPointRef = useRef<NoteActivationPoint | null | undefined>(activationPoint);
  const referenceResultsRef = useRef<SearchResult[]>([]);
  const referencePickRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
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
    const pos = caretPosition(value, containerRef.current);
    setSelectionPosition(pos);
    setInTable(value.isActive("table"));
    const beforeCaret = value.state.doc.textBetween(0, value.state.selection.from, "\n");
    const reference = beforeCaret.match(/\[\[([^\]]*)$/);
    if (reference) {
      setReferenceIndex(0);
      setReferenceState({ query: reference[1] ?? "", mode: "bracket", position: pos });
    } else {
      setReferenceState((previous) => previous?.mode === "slash-embed" ? previous : null);
    }
    const query = noteSlashQuery(beforeCaret);
    if (query === null) {
      setSlash(null);
      return;
    }
    setSlashPosition(pos);
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
      const hasSelection = !value.state.selection.empty;
      setHasTextSelection(hasSelection);
      if (hasSelection) {
        const currentHref = value.getAttributes("link").href;
        setLinkURL(typeof currentHref === "string" ? currentHref : "");
      }
      syncTriggers(value);
    },
    onCreate: ({ editor: value }) => {
      const normalized = ensureNoteBlockIds(value.getJSON() as NoteDocument);
      if (JSON.stringify(normalized) !== JSON.stringify(value.getJSON())) {
        value.commands.setContent(normalized, { emitUpdate: false });
        onDocumentChange(normalized);
      }
    },
  });
  editorRef.current = editor;

  useEffect(() => {
    referenceResultsRef.current = referenceResults;
  }, [referenceResults]);

  useEffect(() => {
    if (!editor) return undefined;
    const point = activationPointRef.current;
    activationPointRef.current = null;
    const frame = window.requestAnimationFrame(() => focusEditorAtPoint(editor, point));
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  useEffect(() => {
    if (!referenceState) {
      setReferenceResults([]);
      return undefined;
    }
    const query = referenceState.query.trim();
    if (!query) {
      setReferenceResults([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchNotespace(query).then((results) => {
        if (!active) return;
        const filtered = results.filter((result) => (
          result.type === "note"
          && Boolean(result.noteId)
          && (referenceState.mode !== "slash-embed" || result.noteId !== note.id)
        ));
        setReferenceResults(filtered.slice(0, 8));
      }).catch(() => { if (active) setReferenceResults([]); });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [note.id, referenceState]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const reportSize = () => onAutoResize(elementId, Math.max(NOTE_CARD_MIN_HEIGHT, Math.ceil(dom.scrollHeight + 24)));
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
    if (mode === "embed" && result.noteId === note.id) {
      onError("A Note cannot embed itself.");
      return;
    }
    const label = result.excerpt.trim() || "Canvas Note";
    const targetWorkspace = result.workspaceId || workspaceId;
    const href = `/workspaces/${encodeURIComponent(targetWorkspace)}?noteId=${encodeURIComponent(result.noteId)}`;
    if (referenceState?.mode === "slash-embed") {
      editor.chain().focus().insertContent({
        type: "noteEmbed",
        attrs: { noteId: result.noteId, workspaceId: targetWorkspace, label },
      }).run();
      setReferenceState(null);
      return;
    }
    const beforeCaret = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
    const match = beforeCaret.match(/\[\[([^\]]*)$/);
    if (!match) return;
    const from = editor.state.selection.from - match[0].length;
    if (mode === "embed") {
      editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).insertContentAt(from, {
        type: "noteEmbed",
        attrs: { noteId: result.noteId, workspaceId: targetWorkspace, label },
      }).run();
    } else {
      editor.chain().focus().deleteRange({ from, to: editor.state.selection.from }).insertContentAt(from, label).setTextSelection({ from, to: from + label.length }).setLink({ href }).setTextSelection(from + label.length).run();
    }
    setReferenceState(null);
  }, [editor, note.id, onError, referenceState?.mode, workspaceId]);

  useEffect(() => {
    referencePickRef.current = () => {
      const result = referenceResultsRef.current[referenceIndex % Math.max(1, referenceResultsRef.current.length)];
      if (result) applyReference(result, referenceState?.mode === "slash-embed" ? "embed" : "link");
    };
  }, [applyReference, referenceIndex, referenceState?.mode]);

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
    ["Math", () => setMathPrompt({ latex: "x^2", block: false, error: null, position: slashPosition })],
    ["Embed note", () => {
      setReferenceIndex(0);
      setReferenceState({ query: "", mode: "slash-embed", position: slashPosition });
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

  const importImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await insertImageFile(file);
  };

  const applyLink = () => {
    const href = linkURL.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!isSafeNoteLink(href)) {
      onError("Only http(s), mailto, and internal Workspace links are allowed.");
      return;
    }
    editor.chain().focus().setLink({ href }).run();
    setLinkURL("");
  };

  const unlinkSelection = () => {
    editor.chain().focus().unsetLink().run();
    setLinkURL("");
  };

  const submitMathPrompt = () => {
    if (!mathPrompt) return;
    const validation = renderNoteLatex(mathPrompt.latex, mathPrompt.block);
    if (!validation.ok) {
      setMathPrompt({ ...mathPrompt, error: validation.error });
      return;
    }
    const latex = mathPrompt.latex.trim();
    if (mathPrompt.block) {
      editor.chain().focus().insertBlockMath({ latex }).run();
    } else {
      editor.chain().focus().insertInlineMath({ latex }).run();
    }
    setMathPrompt(null);
  };

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
    if (referenceState !== null && event.key === "ArrowDown") {
      event.preventDefault(); setReferenceIndex((value) => value + 1); return true;
    }
    if (referenceState !== null && event.key === "ArrowUp") {
      event.preventDefault(); setReferenceIndex((value) => Math.max(0, value - 1)); return true;
    }
    if (referenceState !== null && event.key === "Enter") {
      const result = referenceResultsRef.current[referenceIndex % Math.max(1, referenceResultsRef.current.length)];
      if (result) { event.preventDefault(); referencePickRef.current?.(); return true; }
    }
    if (referenceState !== null && event.key === "Escape") {
      event.preventDefault(); setReferenceState(null); return true;
    }
    if (mathPrompt !== null && event.key === "Escape") {
      event.preventDefault(); setMathPrompt(null); return true;
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
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void importImage(event); }} aria-label="Insert image" />
      {hasTextSelection && (
        <NoteFormattingToolbar
          editor={editor}
          position={selectionPosition}
          linkURL={linkURL}
          onLinkURLChange={setLinkURL}
          onApplyLink={applyLink}
          onUnlink={unlinkSelection}
        />
      )}
      {inTable && !hasTextSelection && <NoteTableToolbar editor={editor} />}
      {mathPrompt && (
        <NoteMathPrompt
          prompt={mathPrompt}
          onChange={(patch) => setMathPrompt((current) => current ? { ...current, ...patch } : null)}
          onSubmit={submitMathPrompt}
          onCancel={() => {
            setMathPrompt(null);
            editor.commands.focus();
          }}
        />
      )}
      {referenceState !== null && (
        <div
          className="notespace-note-ui absolute z-10 grid min-w-52 gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
          style={{ left: referenceState.position.left, top: referenceState.position.top }}
          role="listbox"
          aria-label="Canvas Note references"
        >
          {referenceState.mode === "slash-embed" && (
            <input
              autoFocus
              className="h-6 w-full rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent"
              value={referenceState.query}
              onChange={(event) => {
                setReferenceIndex(0);
                setReferenceState((current) => current ? { ...current, query: event.target.value } : null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setReferenceState(null);
                  editor.commands.focus();
                } else if (event.key === "Enter" && referenceResults.length > 0) {
                  event.preventDefault();
                  const chosen = referenceResults[referenceIndex % referenceResults.length];
                  if (chosen) applyReference(chosen, "embed");
                }
              }}
              placeholder="Search Note to embed…"
              aria-label="Search Note to embed"
            />
          )}
          {referenceResults.length > 0 ? referenceResults.map((result, index) => (
            <div key={`${result.noteId}-${result.workspaceId}`} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${index === referenceIndex % referenceResults.length ? "bg-tint" : ""}`}>
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-1 text-left text-ink hover:text-accent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyReference(result, referenceState.mode === "slash-embed" ? "embed" : "link")}
              >
                {result.excerpt.trim() || "Canvas Note"}
              </button>
              {referenceState.mode === "bracket" && result.noteId !== note.id && (
                <button
                  type="button"
                  className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyReference(result, "embed")}
                >
                  Embed
                </button>
              )}
              {referenceState.mode === "bracket" && onPlaceLinkedNote && result.noteId && (
                <button
                  type="button"
                  className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { void onPlaceLinkedNote(result.noteId!); }}
                >
                  Place
                </button>
              )}
            </div>
          )) : <span className="px-2 py-1 text-[10px] text-muted">Type a Note title or ID…</span>}
        </div>
      )}
      {slash && visibleCommands.length > 0 && (
        <div
          className="notespace-note-ui absolute z-10 grid min-w-36 gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
          style={{ left: slashPosition.left, top: slashPosition.top }}
          role="menu"
          aria-label="Note slash commands"
        >
          {visibleCommands.map(([label, command], index) => (
            <button
              key={label}
              type="button"
              className={"rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint " + (index === slash.index % visibleCommands.length ? "bg-tint text-accent" : "")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runSlashCommand(command)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-y-auto" style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function NoteCardStatus({
  entry,
  onRetry,
  onRemoveMissing,
}: {
  entry: Exclude<CanvasNoteEntry, { status: "ready" }>;
  onRetry: () => void;
  onRemoveMissing?: () => void;
}) {
  if (entry.status === "loading") {
    return <div className="grid content-start gap-2 px-3.5 py-3" aria-busy="true" aria-label="Loading Note">
      <span className="h-2.5 w-3/5 rounded bg-tint" />
      <span className="h-2.5 w-4/5 rounded bg-tint" />
      <span className="h-2.5 w-2/5 rounded bg-tint" />
    </div>;
  }
  if (entry.status === "missing") {
    return <div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="status">
      <span>This Note is no longer available.</span>
      {onRemoveMissing && (
        <button
          type="button"
          className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-danger hover:bg-tint"
          onClick={onRemoveMissing}
        >
          Remove from canvas
        </button>
      )}
    </div>;
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
  activationPoint?: NoteActivationPoint | null;
  onEditingChange: (elementId: string | null) => void;
  onDocumentChange: (noteId: string, document: NoteDocument) => void;
  onRetry: (noteId: string) => void;
  onRemoveMissing?: (elementId: string) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onError: (message: string) => void;
};

function NoteCardBody({
  entry,
  editable,
  folded,
  detail,
  zoom,
  bodyMaxHeight,
  onRetry,
  onRemoveMissing,
  renderEditor,
}: {
  entry: CanvasNoteEntry;
  editable: boolean;
  folded: boolean;
  detail: NoteCardDetail;
  zoom: number;
  bodyMaxHeight?: number;
  onRetry: () => void;
  onRemoveMissing?: () => void;
  renderEditor: (note: Note) => ReactNode;
}) {
  if (entry.status !== "ready") return <NoteCardStatus entry={entry} onRetry={onRetry} onRemoveMissing={onRemoveMissing} />;
  if (editable) return renderEditor(entry.note);
  if (folded) return <NoteLabel document={entry.note.document} zoom={zoom} lines={1} />;
  if (detail === "label") return <NoteLabel document={entry.note.document} zoom={zoom} lines={2} />;
  return (
    <div className="overflow-y-auto" style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}>
      <NoteReadView document={entry.note.document} />
    </div>
  );
}

function CanvasNoteCard({
  element,
  reference,
  entry,
  saveState,
  workspaceId,
  viewport,
  selected,
  editing,
  activationPoint,
  onEditingChange,
  onDocumentChange,
  onRetry,
  onRemoveMissing,
  onAutoResize,
  onPlaceLinkedNote,
  onError,
}: CanvasNoteCardProps) {
  const folded = reference.compact === true;
  const editable = editing && entry.status === "ready";
  const collapsed = folded && !editable;
  const frame = noteCardFrame(element, viewport, collapsed);
  const bodyMaxHeight = noteCardBodyMaxHeight(element.height, collapsed, reference.heightMode);
  const style = {
    ...frame,
    ...(reference.heightMode === "fixed" && !collapsed ? { height: element.height } : {}),
    "--note-ui-scale": noteCardUiScale(viewport.zoom),
  } as CSSProperties;
  const frameClass = "absolute rounded-lg border bg-surface text-ink "
    + (collapsed ? "overflow-hidden " : "overflow-visible ")
    + (selected || editable ? "border-accent/70 ring-2 ring-accent/15" : "border-line")
    + (editable ? " pointer-events-auto" : " pointer-events-none");
  return <article className={frameClass} style={style} data-note-element={element.id} data-note-compact={folded || undefined} data-note-height-mode={reference.heightMode ?? "auto"} data-note-state={entry.status} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") onEditingChange(null); }}>
    <NoteCardBody
      entry={entry}
      editable={editable}
      folded={collapsed}
      detail={noteCardDetail(viewport.zoom, editable)}
      zoom={viewport.zoom}
      bodyMaxHeight={bodyMaxHeight}
      onRetry={() => onRetry(reference.noteId)}
      onRemoveMissing={onRemoveMissing ? () => onRemoveMissing(element.id) : undefined}
      renderEditor={(note) => (
        <NoteEditor
          note={note}
          elementId={element.id}
          workspaceId={workspaceId}
          activationPoint={activationPoint}
          bodyMaxHeight={bodyMaxHeight}
          onDocumentChange={(document) => onDocumentChange(note.id, document)}
          onAutoResize={onAutoResize}
          onPlaceLinkedNote={onPlaceLinkedNote}
          onError={onError}
          onEscape={() => onEditingChange(null)}
        />
      )}
    />
    <NoteSaveIndicator state={saveState} />
  </article>;
}

const ignoreAutoResize = () => {};

export function CanvasNoteCardLayer({
  elements,
  workspaceId,
  viewport,
  selectedElementId,
  editingElementId,
  activationPoint,
  onEditingChange,
  onRegisterFlush,
  onUpdateNote,
  onSaveState,
  onAutoResize,
  onRemoveMissing,
  onPlaceLinkedNote,
  onError,
}: {
  elements: readonly OrderedExcalidrawElement[];
  workspaceId: string;
  viewport: CanvasViewport;
  selectedElementId: string | null;
  editingElementId: string | null;
  activationPoint?: NoteActivationPoint | null;
  onEditingChange: (elementId: string | null) => void;
  onRegisterFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onUpdateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  onSaveState?: (status: NoteSaveStatus) => void;
  onAutoResize?: (elementId: string, height: number) => void;
  onRemoveMissing?: (elementId: string) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
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
        activationPoint={editingElementId === element.id ? activationPoint : null}
        onEditingChange={onEditingChange}
        onDocumentChange={store.queue}
        onRetry={store.retry}
        onRemoveMissing={onRemoveMissing}
        onAutoResize={onAutoResize ?? ignoreAutoResize}
        onPlaceLinkedNote={onPlaceLinkedNote}
        onError={onError}
      />)}
    </div>
  </CanvasNoteStoreProvider>;
}
