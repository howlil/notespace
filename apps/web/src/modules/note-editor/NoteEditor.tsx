import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import "katex/dist/katex.min.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Note } from "../../platform/api/note-api";
import { storeImageAsset } from "../../platform/assets/image-store";
import { isSafeNoteLink, noteFirstLine, type NoteDocument } from "../../entities/note";
import { ensureNoteBlockIds } from "./extensions/block-identity";
import { createNoteExtensions, type NoteMathEditRequest } from "./extensions/create-note-extensions";
import { extractBlocksFromDocument } from "./model/note-extract";
import { filterNoteSlashCommands, noteMentionQuery, noteSlashQuery, type NoteSlashCommandId } from "./model/note-slash";
import { renderNoteLatex, upgradeLatexDelimitersInDocument } from "./lib/note-math";
import { sanitizePastedHTML } from "./lib/note-sanitize";
import { syncPendingNoteDOMSelection } from "./lib/note-selection-sync";
import { NoteFormattingToolbar } from "./toolbar/NoteFormattingToolbar";
import { NoteTableToolbar } from "./toolbar/NoteTableToolbar";
import { NoteMathPrompt } from "./toolbar/NoteMathPrompt";
import { NoteReferencePicker } from "./toolbar/NoteReferencePicker";
import { NoteSlashMenu } from "./toolbar/NoteSlashMenu";
import {
  caretPosition,
  FALLBACK_ANCHOR,
  FALLBACK_POSITION,
  focusEditorAtPoint,
  posPosition,
  selectionAnchor,
  type CaretPosition,
  type MathPromptState,
  type NoteActivationPoint,
  type NoteCreatedConnection,
  type SelectionAnchor,
} from "./toolbar/editor-positioning";
import { useNoteReferences } from "./use-note-references";

export type NoteEditorProps = {
  note: Note;
  elementId: string;
  workspaceId: string;
  minHeight?: number;
  activationPoint?: NoteActivationPoint | null;
  bodyMaxHeight?: number;
  onDocumentChange: (document: NoteDocument) => void;
  readDocument: (noteId: string) => NoteDocument | undefined;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onExtractToNote?: (sourceElementId: string, extractedDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onSuccess?: (message: string) => void;
  onError: (message: string) => void;
  onEscape: () => void;
};

export function NoteEditor(props: NoteEditorProps) {
  const {
    note,
    elementId,
    workspaceId,
    minHeight = 96,
    activationPoint,
    bodyMaxHeight,
    onDocumentChange,
    readDocument,
    onAutoResize,
    onPlaceLinkedNote,
    onExtractToNote,
    onCreateAndLinkNote,
    onSuccess,
    onError,
    onEscape,
  } = props;
  const [slash, setSlash] = useState<{ query: string; index: number } | null>(null);
  const [slashPosition, setSlashPosition] = useState<CaretPosition>(FALLBACK_POSITION);
  const [selectionBounds, setSelectionBounds] = useState<SelectionAnchor>(FALLBACK_ANCHOR);
  const [linkURL, setLinkURL] = useState("");
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [inTable, setInTable] = useState(false);
  const [mathPrompt, setMathPrompt] = useState<MathPromptState | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const appliedNoteIdRef = useRef(note.id);
  const appliedRevisionRef = useRef(note.revision);
  const activationPointRef = useRef<NoteActivationPoint | null | undefined>(activationPoint);
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const onEditMathRef = useRef<(info: NoteMathEditRequest) => void>(() => {});
  const extractingRef = useRef(false);
  const [initialDocument] = useState(() => note.document);
  const [extensions] = useState(() => createNoteExtensions({
    onEditMath: (info) => onEditMathRef.current(info),
  }));

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
  const insertImageFileRef = useRef(insertImageFile);
  insertImageFileRef.current = insertImageFile;
  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;

  const syncTriggersRef = useRef<(value: Editor) => void>(() => {});

  const editorProps = useMemo(() => ({
    attributes: { class: "notespace-note-content outline-none", "aria-label": "Note content" },
    transformPastedHTML: sanitizePastedHTML,
    handlePaste: (_view: EditorView, event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find((value) => value.type.startsWith("image/"));
      if (!file) return false;
      event.preventDefault();
      void insertImageFileRef.current(file);
      return true;
    },
    handleDrop: (_view: EditorView, event: DragEvent, _slice: unknown, moved: boolean) => {
      if (moved) return false;
      const file = [...(event.dataTransfer?.files ?? [])].find((value) => value.type.startsWith("image/"));
      if (!file) return false;
      event.preventDefault();
      void insertImageFileRef.current(file);
      return true;
    },
    handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
      if (!event.isComposing && event.keyCode !== 229) syncPendingNoteDOMSelection(view);
      return keyHandlerRef.current(event);
    },
    handleDOMEvents: {
      keyup: (view: EditorView) => {
        syncPendingNoteDOMSelection(view);
        return false;
      },
    },
  }), []);

  const editor = useEditor({
    extensions,
    content: initialDocument,
    immediatelyRender: false,
    editorProps,
    onUpdate: ({ editor: value }) => {
      onDocumentChangeRef.current(value.getJSON() as NoteDocument);
      syncTriggersRef.current(value);
    },
    onSelectionUpdate: ({ editor: value }) => {
      const hasSelection = !value.state.selection.empty;
      setHasTextSelection(hasSelection);
      if (hasSelection) {
        const currentHref = value.getAttributes("link").href;
        setLinkURL(typeof currentHref === "string" ? currentHref : "");
      }
      syncTriggersRef.current(value);
    },
    onCreate: ({ editor: value }) => {
      const normalized = ensureNoteBlockIds(upgradeLatexDelimitersInDocument(value.getJSON() as NoteDocument));
      if (JSON.stringify(normalized) !== JSON.stringify(value.getJSON())) {
        value.commands.setContent(normalized, { emitUpdate: false });
        onDocumentChangeRef.current(normalized);
      }
    },
  });
  editorRef.current = editor;

  const {
    referenceState,
    setReferenceState,
    referenceResults,
    blockResults,
    blocksLoading,
    referenceIndex,
    setReferenceIndex,
    canCreateAndLink,
    referenceResultsRef,
    blockResultsRef,
    referencePickRef,
    applyReference,
    applyBlockReference,
    createAndLinkQuery,
  } = useNoteReferences({
    editor,
    noteId: note.id,
    elementId,
    workspaceId,
    onCreateAndLinkNote,
    onError,
  });

  syncTriggersRef.current = (value: Editor) => {
    const pos = caretPosition(value, containerRef.current);
    setSelectionBounds(selectionAnchor(value, containerRef.current));
    setInTable(value.isActive("table"));
    const beforeCaret = value.state.doc.textBetween(0, value.state.selection.from, "\n");
    const mention = noteMentionQuery(beforeCaret);
    if (mention) {
      setReferenceIndex(0);
      setReferenceState({
        mode: "mention",
        trigger: mention.trigger,
        matchLength: mention.matchLength,
        query: mention.query,
        step: "pick-note",
        position: pos,
      });
    } else {
      setReferenceState((previous) => (
        previous?.mode === "slash-embed" || previous?.mode === "slash-block-ref"
          ? previous
          : null
      ));
    }
    const query = noteSlashQuery(beforeCaret);
    if (query === null) {
      setSlash(null);
      return;
    }
    setSlashPosition(pos);
    setSlash((previous) => ({ query, index: previous?.query === query ? previous.index : 0 }));
  };

  onEditMathRef.current = (info: NoteMathEditRequest) => {
    if (!editor || !editor.isEditable) return;
    setSlash(null);
    setReferenceState(null);
    setMathPrompt({
      pos: info.pos,
      latex: info.latex,
      block: info.block,
      originalBlock: info.block,
      error: null,
      position: posPosition(editor, info.pos, containerRef.current),
    });
  };

  useEffect(() => {
    if (!editor) return undefined;
    const point = activationPointRef.current;
    activationPointRef.current = null;
    const frame = window.requestAnimationFrame(() => focusEditorAtPoint(editor, point));
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const reportSize = () => onAutoResize(elementId, Math.max(minHeight, Math.ceil(dom.scrollHeight + 24)));
    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(dom);
    return () => observer.disconnect();
  }, [editor, elementId, minHeight, onAutoResize]);

  useEffect(() => {
    if (!editor) return;
    const noteIdentityChanged = appliedNoteIdRef.current !== note.id;
    const serverRevisionChanged = appliedRevisionRef.current !== note.revision;
    if (noteIdentityChanged || serverRevisionChanged) {
      const current = readDocument(note.id) ?? note.document;
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(current)) editor.commands.setContent(current, { emitUpdate: false });
      appliedNoteIdRef.current = note.id;
      appliedRevisionRef.current = note.revision;
    }
  }, [editor, note.id, note.revision, note.document, readDocument]);

  const extractSelectionToNote = useCallback(async () => {
    if (!editor || !onExtractToNote || extractingRef.current) return;
    const { $from, $to } = editor.state.selection;
    const startIndex = $from.index(0);
    const endIndex = $to.depth === 0 ? Math.max(startIndex, $to.index(0) - 1) : $to.index(0);
    const currentDoc = editor.getJSON() as NoteDocument;
    const preview = extractBlocksFromDocument(currentDoc, { startIndex, endIndex });
    if (!preview) {
      onError("Select non-empty content to extract to a Note.");
      return;
    }
    extractingRef.current = true;
    try {
      const extractedDoc = ensureNoteBlockIds(preview.extracted);
      const created = await onExtractToNote(elementId, extractedDoc);
      if (!created) return;
      const label = noteFirstLine(extractedDoc) || "Extracted Note";
      const href = `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(created.noteId)}`;
      const liveDoc = editor.isDestroyed ? (readDocument(note.id) ?? currentDoc) : (editor.getJSON() as NoteDocument);
      const extractedResult = extractBlocksFromDocument(liveDoc, { startIndex, endIndex }, {
        leaveLink: { href, label },
      }) ?? extractBlocksFromDocument(currentDoc, { startIndex, endIndex }, {
        leaveLink: { href, label },
      });
      if (!extractedResult) return;
      const remainingDoc = ensureNoteBlockIds(extractedResult.remaining);
      if (editor.isDestroyed) {
        onDocumentChangeRef.current(remainingDoc);
      } else {
        editor.commands.setContent(remainingDoc, { emitUpdate: true });
      }
      onSuccess?.("Extracted selection to a connected Note.");
    } finally {
      extractingRef.current = false;
    }
  }, [editor, elementId, note.id, onError, onExtractToNote, onSuccess, readDocument, workspaceId]);

  if (!editor) return null;

  const isModal = bodyMaxHeight === undefined;
  const visibleCommands = slash ? filterNoteSlashCommands(slash.query) : [];

  const executeSlashCommand = (commandId: NoteSlashCommandId) => {
    switch (commandId) {
      case "heading1": editor.chain().focus().toggleHeading({ level: 1 }).run(); return;
      case "heading2": editor.chain().focus().toggleHeading({ level: 2 }).run(); return;
      case "heading3": editor.chain().focus().toggleHeading({ level: 3 }).run(); return;
      case "bulletList": editor.chain().focus().toggleBulletList().run(); return;
      case "orderedList": editor.chain().focus().toggleOrderedList().run(); return;
      case "taskList": editor.chain().focus().toggleTaskList().run(); return;
      case "toggle": editor.chain().focus().insertNoteToggle().run(); return;
      case "codeBlock": editor.chain().focus().toggleCodeBlock().run(); return;
      case "blockquote": editor.chain().focus().toggleBlockquote().run(); return;
      case "callout": editor.chain().focus().wrapIn("noteCallout", { tone: "note" }).run(); return;
      case "divider": editor.chain().focus().setHorizontalRule().run(); return;
      case "table": editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(); return;
      case "image": imageInputRef.current?.click(); return;
      case "math": setMathPrompt({ latex: "x^2", block: false, error: null, position: slashPosition }); return;
      case "embedNote":
        setReferenceIndex(0);
        setReferenceState({ mode: "slash-embed", query: "", step: "pick-note", position: slashPosition });
        return;
      case "blockReference":
        setReferenceIndex(0);
        setReferenceState({ mode: "slash-block-ref", query: "", step: "pick-note", position: slashPosition });
        return;
      case "extractToNote":
        void extractSelectionToNote();
    }
  };

  const runSlashCommand = (commandId: NoteSlashCommandId) => {
    const position = editor.state.selection.from;
    const length = (slash?.query.length ?? 0) + 1;
    editor.chain().focus().deleteRange({ from: Math.max(1, position - length), to: position }).run();
    setSlash(null);
    executeSlashCommand(commandId);
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
    if (mathPrompt.pos !== undefined) {
      if (mathPrompt.block === mathPrompt.originalBlock) {
        if (mathPrompt.block) editor.chain().focus().updateBlockMath({ pos: mathPrompt.pos, latex }).run();
        else editor.chain().focus().updateInlineMath({ pos: mathPrompt.pos, latex }).run();
      } else if (mathPrompt.block) {
        editor.chain().focus().deleteInlineMath({ pos: mathPrompt.pos }).insertBlockMath({ latex, pos: mathPrompt.pos }).run();
      } else {
        editor.chain().focus().deleteBlockMath({ pos: mathPrompt.pos }).insertContentAt(mathPrompt.pos, {
          type: "paragraph",
          content: [{ type: "inlineMath", attrs: { latex } }],
        }).run();
      }
      setMathPrompt(null);
      return;
    }
    if (mathPrompt.block) editor.chain().focus().insertBlockMath({ latex }).run();
    else editor.chain().focus().insertInlineMath({ latex }).run();
    setMathPrompt(null);
  };

  const handleEditorKey = (event: KeyboardEvent): boolean => {
    if (slash && visibleCommands.length > 0) {
      if (event.key === "ArrowDown") { event.preventDefault(); setSlash({ ...slash, index: slash.index + 1 }); return true; }
      if (event.key === "ArrowUp") { event.preventDefault(); setSlash({ ...slash, index: Math.max(0, slash.index - 1) }); return true; }
      if (event.key === "Enter") {
        event.preventDefault();
        runSlashCommand(visibleCommands[slash.index % visibleCommands.length].id);
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
      const hasItems = referenceState.step === "pick-block"
        ? blockResultsRef.current.length > 0
        : referenceResultsRef.current.length > 0 || canCreateAndLink;
      if (hasItems) {
        event.preventDefault();
        referencePickRef.current?.();
        return true;
      }
    }
    if (referenceState !== null && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setReferenceState(null);
      return true;
    }
    if (mathPrompt !== null && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMathPrompt(null);
      return true;
    }
    if (event.key !== "Escape") return false;
    event.preventDefault();
    event.stopPropagation();
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
          anchor={selectionBounds}
          isModal={isModal}
          linkURL={linkURL}
          onLinkURLChange={setLinkURL}
          onApplyLink={applyLink}
          onUnlink={unlinkSelection}
          onExtract={onExtractToNote ? () => { void extractSelectionToNote(); } : undefined}
        />
      )}
      {inTable && !hasTextSelection && <NoteTableToolbar editor={editor} isModal={isModal} />}
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
        <NoteReferencePicker
          currentNoteId={note.id}
          referenceState={referenceState}
          setReferenceState={setReferenceState}
          referenceResults={referenceResults}
          blockResults={blockResults}
          blocksLoading={blocksLoading}
          referenceIndex={referenceIndex}
          setReferenceIndex={setReferenceIndex}
          canCreateAndLink={canCreateAndLink}
          onApplyReference={applyReference}
          onApplyBlockReference={applyBlockReference}
          onCreateAndLinkQuery={createAndLinkQuery}
          onPlaceLinkedNote={onPlaceLinkedNote}
          onFocusEditor={() => editor.commands.focus()}
        />
      )}
      {slash && visibleCommands.length > 0 && (
        <NoteSlashMenu
          commands={visibleCommands}
          activeIndex={slash.index}
          position={slashPosition}
          onSelect={runSlashCommand}
        />
      )}
      <div
        data-note-scroll=""
        className="no-scrollbar overflow-y-auto overscroll-contain"
        style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
