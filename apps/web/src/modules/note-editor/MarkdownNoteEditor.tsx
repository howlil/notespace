import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { Annotation, EditorState, Prec, Transaction, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteDocument } from "../../entities/note";
import { listNotes, type NoteSummary } from "../../platform/api/note-api";
import { storeImageAsset } from "../../platform/assets/image-store";
import {
  detectMentionTrigger,
  formatNoteMentionLink,
  type MentionTrigger,
} from "./model/mention-trigger";
import { NoteMentionPopover, type NoteMentionAnchorRect } from "./NoteMentionPopover";

export type NoteActivationPoint = { clientX: number; clientY: number };

const delimiter = Decoration.replace({});
const syncSource = Annotation.define<boolean>();
const inlineStyles: Readonly<Record<string, Decoration>> = {
  StrongEmphasis: Decoration.mark({ class: "note-md-strong" }),
  Emphasis: Decoration.mark({ class: "note-md-emphasis" }),
  InlineCode: Decoration.mark({ class: "note-md-code" }),
  Strikethrough: Decoration.mark({ class: "note-md-strike" }),
  Link: Decoration.mark({ class: "note-md-link" }),
};

function livePreview(view: EditorView) {
  const { doc, selection } = view.state;
  const from = doc.lineAt(selection.main.from).from;
  const to = doc.lineAt(selection.main.to).to;
  const ranges: Range<Decoration>[] = [];
  for (const viewport of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      ...viewport,
      enter(node) {
        const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
        if (heading) {
          ranges.push(Decoration.line({ class: `note-md-heading-${heading[1]}` }).range(doc.lineAt(node.from).from));
        } else if (inlineStyles[node.name]) {
          ranges.push(inlineStyles[node.name].range(node.from, node.to));
        } else if ((node.to <= from || node.from > to) && /^(?:HeaderMark|EmphasisMark|CodeMark|StrikethroughMark)$/.test(node.name)) {
          ranges.push(delimiter.range(node.from, node.to));
        }
      },
    });
  }
  return Decoration.set(ranges, true);
}

const preview = ViewPlugin.fromClass(class {
  decorations;
  constructor(view: EditorView) {
    this.decorations = livePreview(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = livePreview(update.view);
    }
  }
}, { decorations: (value) => value.decorations });

function droppedImages(data: DataTransfer | null) {
  return [...(data?.files ?? [])].filter((file) => file.type.startsWith("image/"));
}

/** Stores each image as a workspace asset and writes its Markdown image at `at`. */
async function insertImages(view: EditorView, workspaceId: string, files: File[], at: number, onError: (message: string) => void) {
  let position = at;
  for (const file of files) {
    try {
      const assetId = crypto.randomUUID();
      await storeImageAsset(workspaceId, assetId, file);
      const src = `/api/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}`;
      const markup = `![${file.name.replace(/[[\]\\\r\n]/g, " ")}](${src})\n`;
      position = Math.min(position, view.state.doc.length);
      view.dispatch({ changes: { from: position, insert: markup }, selection: { anchor: position + markup.length } });
      position += markup.length;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not add this image to the Note.");
    }
  }
}

export function MarkdownNoteEditor(props: {
  noteId: string;
  workspaceId: string;
  document: NoteDocument;
  minHeight?: number;
  fillContainer?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  activationPoint?: NoteActivationPoint | null;
  bodyMaxHeight?: number;
  onDocumentChange: (document: NoteDocument) => void;
  readDocument: (noteId: string) => NoteDocument | undefined;
  onResize: (height: number) => void;
  onError: (message: string) => void;
  onEscape: () => void;
}) {
  const {
    document,
    noteId,
    bodyMaxHeight,
    fillContainer = false,
    autoFocus = true,
    placeholder: placeholderText = "Write in Markdown…",
    minHeight: requestedMinHeight,
  } = props;
  const latest = useRef(props);
  latest.current = props;
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const [mention, setMention] = useState<{ trigger: MentionTrigger; anchorRect: NoteMentionAnchorRect } | null>(null);
  const [mentionNotes, setMentionNotes] = useState<NoteSummary[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionRef = useRef(mention);
  mentionRef.current = mention;
  const mentionNotesRef = useRef(mentionNotes);
  mentionNotesRef.current = mentionNotes;
  const mentionIndexRef = useRef(mentionIndex);
  mentionIndexRef.current = mentionIndex;
  const dismissedFromRef = useRef<number | null>(null);

  const applyMentionSelection = useCallback((note: NoteSummary) => {
    const view = editor.current;
    const active = mentionRef.current;
    if (!view || !active) return;
    const insertText = formatNoteMentionLink(note.label, note.id);
    const { from, to } = active.trigger;
    if (from > view.state.doc.length || to > view.state.doc.length) return;
    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: { anchor: from + insertText.length },
    });
    dismissedFromRef.current = null;
    setMention(null);
    view.focus();
  }, []);

  const applyMentionRef = useRef(applyMentionSelection);
  applyMentionRef.current = applyMentionSelection;

  const mentionOpen = Boolean(mention);
  const mentionQuery = mention?.trigger.query ?? "";

  useEffect(() => {
    if (!mentionOpen) {
      setMentionNotes([]);
      setMentionLoading(false);
      return undefined;
    }
    let active = true;
    const query = mentionQuery.trim();
    setMentionLoading(true);
    const timer = window.setTimeout(() => {
      void listNotes({ q: query || undefined, limit: 12 })
        .then((results) => {
          if (!active) return;
          const filtered = results.filter((item) => item.id !== noteId);
          setMentionNotes(filtered);
          setMentionIndex(0);
          setMentionLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setMentionNotes([]);
          setMentionLoading(false);
        });
    }, query ? 90 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mentionOpen, mentionQuery, noteId]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const { activationPoint, document } = latest.current;
    const applied = latest.current.readDocument(noteId);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: applied?.type === "markdown" ? applied.text : document.text,
        extensions: [
          markdown(), preview, history(), EditorView.lineWrapping, placeholder(placeholderText),
          ...(fillContainer
            ? [
              EditorView.theme({
                "&": {
                  minHeight: `${requestedMinHeight ?? 360}px`,
                  height: "100%",
                  cursor: "text",
                },
                ".cm-scroller": {
                  minHeight: "100%",
                  height: "100%",
                },
                ".cm-content": {
                  minHeight: "100%",
                },
              }),
            ]
            : []),
          EditorView.contentAttributes.of({ "aria-label": "Note Markdown editor" }),
          EditorView.domEventHandlers({
            paste(event, editor) {
              const files = droppedImages(event.clipboardData);
              if (!files.length) return false;
              event.preventDefault();
              void insertImages(editor, latest.current.workspaceId, files, editor.state.selection.main.head, latest.current.onError);
              return true;
            },
            drop(event, editor) {
              const files = droppedImages(event.dataTransfer);
              if (!files.length) return false;
              event.preventDefault();
              const at = editor.posAtCoords({ x: event.clientX, y: event.clientY }) ?? editor.state.selection.main.head;
              void insertImages(editor, latest.current.workspaceId, files, at, latest.current.onError);
              return true;
            },
          }),
          Prec.highest(keymap.of([
            {
              key: "ArrowDown",
              run: () => {
                if (!mentionRef.current || mentionNotesRef.current.length === 0) return false;
                setMentionIndex((prev) => (prev + 1) % mentionNotesRef.current.length);
                return true;
              },
            },
            {
              key: "ArrowUp",
              run: () => {
                if (!mentionRef.current || mentionNotesRef.current.length === 0) return false;
                setMentionIndex((prev) => (prev - 1 + mentionNotesRef.current.length) % mentionNotesRef.current.length);
                return true;
              },
            },
            {
              key: "Enter",
              run: () => {
                if (!mentionRef.current) return false;
                const chosen = mentionNotesRef.current[mentionIndexRef.current];
                if (!chosen) return false;
                applyMentionRef.current(chosen);
                return true;
              },
            },
            {
              key: "Escape",
              run: (editorView) => {
                if (editorView.composing) return false;
                if (mentionRef.current) {
                  dismissedFromRef.current = mentionRef.current.trigger.from;
                  setMention(null);
                  return true;
                }
                latest.current.onEscape();
                return true;
              },
              stopPropagation: true,
            },
          ])),
          keymap.of([
            ...historyKeymap, ...defaultKeymap,
          ]),
          EditorView.updateListener.of((event) => {
            if (event.transactions.some((tr) => tr.docChanged && !tr.annotation(syncSource))) {
              latest.current.onDocumentChange({ type: "markdown", text: event.state.doc.toString() });
            }
            if (event.docChanged || event.selectionSet) {
              const sel = event.state.selection.main;
              const trigger = sel.empty
                ? detectMentionTrigger(event.state.doc.toString(), sel.head)
                : null;
              if (!trigger) {
                dismissedFromRef.current = null;
                setMention(null);
              } else if (dismissedFromRef.current !== trigger.from) {
                dismissedFromRef.current = null;
                const coords = event.view.coordsAtPos(trigger.from) ?? event.view.coordsAtPos(sel.head);
                if (coords) {
                  setMention({
                    trigger,
                    anchorRect: { top: coords.top, left: coords.left, bottom: coords.bottom },
                  });
                }
              }
            }
          }),
        ],
      }),
    });
    editor.current = view;
    const frame = requestAnimationFrame(() => {
      if (!autoFocus && !activationPoint) return;
      const position = activationPoint ? view.posAtCoords({ x: activationPoint.clientX, y: activationPoint.clientY }) : null;
      view.dispatch({ selection: { anchor: position ?? view.state.doc.length } });
      view.focus();
    });
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      const minHeight = latest.current.minHeight ?? 180;
      latest.current.onResize(Math.max(minHeight, Math.ceil(view.contentDOM.scrollHeight + 24)));
    }) : null;
    resize?.observe(view.contentDOM);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      editor.current = null;
      view.destroy();
    };
  }, [autoFocus, fillContainer, noteId, placeholderText, requestedMinHeight]);

  useEffect(() => {
    const view = editor.current;
    const applied = latest.current.readDocument(noteId);
    const text = applied?.type === "markdown" ? applied.text : document.text;
    if (!view || view.state.doc.toString() === text) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      annotations: [syncSource.of(true), Transaction.addToHistory.of(false)],
    });
  }, [noteId, document.text]);

  return (
    <>
      <div
        className={fillContainer
          ? "notespace-note-content notespace-note-markdown flex-1 min-h-full cursor-text overflow-y-auto overscroll-contain"
          : "notespace-note-content notespace-note-markdown overflow-y-auto overscroll-contain"}
        data-flush={fillContainer ? "true" : undefined}
        data-note-scroll=""
        data-note-markdown-editor=""
        style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}
        onMouseDown={(event) => {
          if (!fillContainer) return;
          const view = editor.current;
          if (!view) return;
          const target = event.target as HTMLElement | null;
          if (target === host.current || target === view.scrollDOM || target?.classList.contains("cm-editor")) {
            event.preventDefault();
            view.focus();
            view.dispatch({ selection: { anchor: view.state.doc.length } });
          }
        }}
        onKeyDown={(event) => event.stopPropagation()}
        ref={host}
      />
      <NoteMentionPopover
        open={Boolean(mention)}
        anchorRect={mention?.anchorRect ?? null}
        query={mention?.trigger.query ?? ""}
        notes={mentionNotes}
        loading={mentionLoading}
        selectedIndex={mentionIndex}
        onSelectedIndexChange={setMentionIndex}
        onSelectNote={applyMentionSelection}
      />
    </>
  );
}
