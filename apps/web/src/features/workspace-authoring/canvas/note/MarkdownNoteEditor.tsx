import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { Annotation, EditorState, Transaction, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, placeholder, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { MarkdownNoteDocument, NoteDocument } from "../../../../domain/note/note";
import { NOTE_CARD_MIN_HEIGHT } from "./note-card-layout";

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

export function MarkdownNoteEditor(props: {
  noteId: string;
  document: MarkdownNoteDocument;
  activationPoint?: { clientX: number; clientY: number } | null;
  bodyMaxHeight?: number;
  onDocumentChange: (document: MarkdownNoteDocument) => void;
  readDocument: (noteId: string) => NoteDocument | undefined;
  onResize: (height: number) => void;
  onEscape: () => void;
}) {
  const { document, noteId, bodyMaxHeight } = props;
  const latest = useRef(props);
  latest.current = props;
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);

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
          markdown(), preview, history(), EditorView.lineWrapping, placeholder("Write in Markdown…"),
          EditorView.contentAttributes.of({ "aria-label": "Note Markdown editor" }),
          keymap.of([
            { key: "Escape", run: (editor) => {
              if (editor.composing) return false;
              latest.current.onEscape();
              return true;
            }, stopPropagation: true },
            ...historyKeymap, ...defaultKeymap,
          ]),
          EditorView.updateListener.of((event) => {
            if (event.transactions.some((tr) => tr.docChanged && !tr.annotation(syncSource))) {
              latest.current.onDocumentChange({ type: "markdown", text: event.state.doc.toString() });
            }
          }),
        ],
      }),
    });
    editor.current = view;
    const frame = requestAnimationFrame(() => {
      const position = activationPoint ? view.posAtCoords({ x: activationPoint.clientX, y: activationPoint.clientY }) : null;
      view.dispatch({ selection: { anchor: position ?? view.state.doc.length } });
      view.focus();
    });
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      latest.current.onResize(Math.max(NOTE_CARD_MIN_HEIGHT, Math.ceil(view.contentDOM.scrollHeight + 24)));
    }) : null;
    resize?.observe(view.contentDOM);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      editor.current = null;
      view.destroy();
    };
  }, [noteId]);

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
    <div
      className="notespace-note-content notespace-note-markdown overflow-y-auto overscroll-contain"
      data-note-scroll=""
      data-note-markdown-editor=""
      style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}
      onKeyDown={(event) => event.stopPropagation()}
      ref={host}
    />
  );
}
