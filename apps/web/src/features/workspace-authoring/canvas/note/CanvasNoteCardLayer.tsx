import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import "katex/dist/katex.min.css";
import {
  Bold,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Code,
  CodeXml,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Info,
  Italic,
  Link as LinkIcon,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pencil,
  Quote,
  Scissors,
  Sigma,
  StickyNote,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { getNote, listNotes, type Note, type NoteSummary } from "../../../../adapters/http/note-api";
import { storeImageAsset } from "../../../../adapters/assets/image-store";
import { createNoteExtensions, ensureNoteBlockIds, type NoteMathEditRequest } from "./note-extensions";
import {
  extractBlocksFromDocument,
  listNoteBlocks,
  toggleNoteToggleInDocument,
  toggleTaskInDocument,
  type NoteBlockSummary,
} from "./note-extract";
import { renderNoteLatex } from "./note-math";
import { sanitizePastedHTML } from "./note-sanitize";
import { syncPendingNoteDOMSelection } from "./note-selection-sync";
import {
  isSafeNoteLink,
  NOTE_CARD_COLORS,
  NOTE_CARD_SHAPES,
  NOTE_HIGHLIGHT_TONES,
  NOTE_TEXT_COLOR_TONES,
  noteFirstLine,
  readCanvasNoteReference,
  type CanvasNoteReference,
  type NoteCardColor,
  type NoteCardShape,
  type NoteDocument,
} from "../../../../domain/note/note";
import { useExclusivePopup } from "../../../../shared/ui/overlays/dismissable";
import type { CanvasNoteEntry, NoteSaveState, NoteSaveStatus } from "./canvas-note-store";
import {
  NOTE_CARD_MIN_HEIGHT,
  noteCardBodyMaxHeight,
  noteCardDetail,
  noteCardFrame,
  noteCardLabelFontSize,
  type NoteCardDetail,
} from "./note-card-layout";
import { filterNoteSlashCommands, noteMentionQuery, noteSlashQuery, type NoteSlashCommandId } from "./note-slash";
import { NoteFocusModal } from "./NoteFocusModal";
import { NoteInfoPopover } from "./NoteInfoPopover";
import { NoteReadView } from "./NoteReadView";
import { CanvasNoteStoreProvider, useCanvasNoteSnapshot, useCanvasNoteStore } from "./use-canvas-note-store";

const noteActionIconClass = "grid size-6 place-items-center rounded text-muted hover:bg-tint hover:text-accent";

const NOTE_SLASH_ICONS: Record<NoteSlashCommandId, LucideIcon> = {
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListTodo,
  toggle: ChevronRight,
  codeBlock: CodeXml,
  blockquote: Quote,
  callout: Info,
  divider: Minus,
  table: TableIcon,
  image: ImageIcon,
  math: Sigma,
  embedNote: StickyNote,
  blockReference: Link2,
  extractToNote: Scissors,
};

type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };
export type NoteActivationPoint = { clientX: number; clientY: number };
export type NoteCreatedConnection = { noteId: string; elementId: string };

export function CanvasNoteActions({
  folded,
  fixedHeight,
  color = "default",
  shape = "rounded",
  onEdit,
  onToggleFold,
  onColorChange,
  onShapeChange,
  onExpand,
  onOpenInfo,
  onOpenNotePicker,
  onFitContent,
  onPlaceLinked,
  onDuplicate,
  onTrash,
  onDelete,
}: {
  folded: boolean;
  fixedHeight?: boolean;
  color?: NoteCardColor;
  shape?: NoteCardShape;
  onEdit: () => void;
  onToggleFold: () => void;
  onColorChange?: (color: NoteCardColor) => void;
  onShapeChange?: (shape: NoteCardShape) => void;
  onExpand?: () => void;
  onOpenInfo?: () => void;
  onOpenNotePicker?: () => void;
  onFitContent?: () => void;
  onPlaceLinked?: () => void;
  onDuplicate: () => void;
  onTrash?: () => void;
  onDelete: () => void;
}) {
  const [more, setMore] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMore(false), []);
  useExclusivePopup(more, closeMore);

  useEffect(() => {
    if (!more) return;
    const onOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && toolbarRef.current?.contains(event.target)) return;
      closeMore();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMore();
      moreButtonRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onOutsidePointerDown, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [closeMore, more]);

  return (
    <div
      ref={toolbarRef}
      className="notespace-note-actions pointer-events-auto relative z-[1] flex w-fit items-center gap-0.5 rounded-lg border border-line bg-surface p-1"
      role="toolbar"
      aria-label="Canvas Note actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className={noteActionIconClass} aria-label="Edit" title="Edit" onClick={onEdit}><Pencil className="size-3.5" /></button>
      <button type="button" className={noteActionIconClass} aria-label={folded ? "Unfold" : "Fold"} title={folded ? "Unfold" : "Fold"} onClick={onToggleFold}>
        {folded ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}
      </button>
      <button
        ref={moreButtonRef}
        type="button"
        className={noteActionIconClass}
        aria-label="More"
        title="More"
        aria-expanded={more}
        aria-haspopup="menu"
        onClick={() => setMore((value) => !value)}
      >
        <MoreHorizontal className="size-3.5" />
      </button>
      {more && (
        <div
          className="absolute right-0 top-full mt-1 grid min-w-44 gap-0.5 rounded-lg border border-line bg-surface p-1 [box-shadow:var(--shadow-popup)]"
          role="menu"
          aria-label="More Note actions"
        >
          {onColorChange && (
            <div className="mb-0.5 border-b border-line px-1.5 pt-1 pb-1.5" role="group" aria-label="Card color">
              <span className="mb-1 block text-[9px] font-medium text-muted">Color</span>
              <div className="flex items-center gap-1.5">
                {NOTE_CARD_COLORS.map((swatch) => {
                  const active = color === swatch;
                  return (
                    <button
                      key={swatch}
                      type="button"
                      data-note-color-swatch={swatch}
                      aria-label={`Card color ${swatch}`}
                      aria-pressed={active}
                      title={swatch}
                      className={"size-4 rounded-full border transition-transform hover:scale-110 " + (active ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
                      onClick={() => { setMore(false); onColorChange(swatch); }}
                    />
                  );
                })}
              </div>
            </div>
          )}
          {onShapeChange && (
            <div className="mb-0.5 border-b border-line px-1.5 pt-1 pb-1.5" role="group" aria-label="Card shape">
              <span className="mb-1 block text-[9px] font-medium text-muted">Shape</span>
              <div className="flex items-center gap-1">
                {NOTE_CARD_SHAPES.map((option) => {
                  const active = shape === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      data-note-shape-option={option}
                      aria-label={`Card shape ${option}`}
                      aria-pressed={active}
                      title={option === "rounded" ? "Rounded corners" : "Square corners"}
                      className={"flex h-6 flex-1 items-center justify-center gap-1 rounded border text-[10px] capitalize " + (active ? "border-accent bg-tint text-accent" : "border-line text-muted hover:text-ink")}
                      onClick={() => { setMore(false); onShapeChange(option); }}
                    >
                      <span className={"size-3 border-[1.5px] border-current " + (option === "rounded" ? "rounded-[4px]" : "rounded-none")} aria-hidden="true" />
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {onExpand && (
            <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onExpand(); }}>Expand</button>
          )}
          {onOpenInfo && (
            <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onOpenInfo(); }}>Info &amp; backlinks</button>
          )}
          {onOpenNotePicker && (
            <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onOpenNotePicker(); }}>Place existing Note</button>
          )}
          {fixedHeight && onFitContent && (
            <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onFitContent(); }}>Fit content</button>
          )}
          <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onDuplicate(); }}>Duplicate</button>
          {onPlaceLinked && (
            <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint" onClick={() => { setMore(false); onPlaceLinked(); }}>Place linked</button>
          )}
          {onTrash && (
            <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-danger hover:bg-tint" onClick={() => { setMore(false); onTrash(); }}>Move to Trash</button>
          )}
          <button type="button" className="rounded px-2 py-1 text-left text-[10px] text-danger hover:bg-tint" onClick={() => { setMore(false); onDelete(); }}>Remove instance</button>
        </div>
      )}
    </div>
  );
}

type CaretPosition = { left: number; top: number };
const FALLBACK_POSITION: CaretPosition = { left: 8, top: 36 };

/** Anchors a popup just below the caret, inside the card, so it opens where the user is typing (B11). */
/** Maps a viewport point into the card's own unscaled coordinates, so popups scale with the zoomed card. */
function cardLocalPoint(host: HTMLElement, clientX: number, clientY: number): { x: number; y: number; width: number } {
  const box = host.getBoundingClientRect();
  const width = host.offsetWidth;
  const scale = width > 0 && box.width > 0 ? box.width / width : 1;
  return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale, width };
}

function caretPosition(value: Editor, host: HTMLElement | null): CaretPosition {
  if (!host) return FALLBACK_POSITION;
  const coords = value.view.coordsAtPos(value.state.selection.from);
  const point = cardLocalPoint(host, coords.left, coords.bottom);
  return {
    left: Math.min(Math.max(8, point.x), Math.max(8, point.width - 200)),
    top: point.y + 4,
  };
}

function posPosition(value: Editor, pos: number, host: HTMLElement | null): CaretPosition {
  if (!host) return FALLBACK_POSITION;
  const coords = value.view.coordsAtPos(pos);
  const point = cardLocalPoint(host, coords.left, coords.bottom);
  return {
    left: Math.min(Math.max(8, point.x), Math.max(8, point.width - 220)),
    top: point.y + 4,
  };
}

/** Vertical extent of the selected text in card-local px, so the toolbar can sit beside it instead of on it. */
type SelectionAnchor = { top: number; bottom: number };
const FALLBACK_ANCHOR: SelectionAnchor = { top: 36, bottom: 56 };

function selectionAnchor(value: Editor, host: HTMLElement | null): SelectionAnchor {
  if (!host) return FALLBACK_ANCHOR;
  const { from, to } = value.state.selection;
  const start = value.view.coordsAtPos(from);
  const end = value.view.coordsAtPos(to);
  return {
    top: cardLocalPoint(host, 0, Math.min(start.top, end.top)).y,
    bottom: cardLocalPoint(host, 0, Math.max(start.bottom, end.bottom)).y,
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

function noteSummaryLabel(summary: NoteSummary): string {
  return summary.label.trim() || summary.excerpt.trim() || "Canvas Note";
}

function noteSummaryWorkspace(summary: NoteSummary, currentWorkspaceId: string): string {
  if (summary.workspaceIds.includes(currentWorkspaceId)) return currentWorkspaceId;
  return summary.workspaceIds[0] || currentWorkspaceId;
}

type ReferenceTargetNote = {
  noteId: string;
  workspaceId: string;
  label: string;
};

type ReferenceState =
  | {
      mode: "mention";
      trigger: "[[" | "@";
      matchLength: number;
      query: string;
      step: "pick-note";
      position: CaretPosition;
    }
  | {
      mode: "slash-embed" | "slash-block-ref";
      query: string;
      step: "pick-note";
      position: CaretPosition;
    }
  | {
      mode: "mention" | "slash-block-ref";
      trigger?: "[[" | "@";
      matchLength?: number;
      query: string;
      step: "pick-block";
      targetNote: ReferenceTargetNote;
      position: CaretPosition;
    };

type MathPromptState = {
  pos?: number;
  latex: string;
  block: boolean;
  originalBlock?: boolean;
  error: string | null;
  position: CaretPosition;
};

const FORMAT_MARKS: readonly { label: string; mark: string; icon: LucideIcon; run: (editor: Editor) => void }[] = [
  { label: "Bold", mark: "bold", icon: Bold, run: (editor) => editor.chain().focus().toggleBold().run() },
  { label: "Italic", mark: "italic", icon: Italic, run: (editor) => editor.chain().focus().toggleItalic().run() },
  { label: "Underline", mark: "underline", icon: UnderlineIcon, run: (editor) => editor.chain().focus().toggleUnderline().run() },
  { label: "Strike", mark: "strike", icon: Strikethrough, run: (editor) => editor.chain().focus().toggleStrike().run() },
  { label: "Code", mark: "code", icon: Code, run: (editor) => editor.chain().focus().toggleCode().run() },
];

const toolbarButtonClass = (active: boolean) =>
  "grid size-7 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-accent "
  + (active ? "bg-tint text-accent" : "text-muted hover:bg-tint hover:text-ink");

const keepSelection = (event: { preventDefault: () => void }) => event.preventDefault();
// Focusing synchronously before running a command avoids @tiptap/core's async requestAnimationFrame focus
// race that can restore an older non-empty selection after the user has moved the caret.
const ensureNoteFocus = (editor: Editor) => {
  if (!editor.view.hasFocus()) editor.view.focus();
};

/**
 * Icon-first formatting bar. On a canvas card it floats above the card's top edge, so it never covers any
 * of the Note's text; in the roomy expanded editor it follows the selection instead. The long link field
 * only opens on demand.
 */
function NoteFormattingToolbar({
  editor,
  anchor,
  isModal,
  linkURL,
  onLinkURLChange,
  onApplyLink,
  onUnlink,
  onExtract,
}: {
  editor: Editor;
  anchor: SelectionAnchor;
  isModal: boolean;
  linkURL: string;
  onLinkURLChange: (value: string) => void;
  onApplyLink: () => void;
  onUnlink: () => void;
  onExtract?: () => void;
}) {
  const [panel, setPanel] = useState<"highlight" | "textColor" | "link" | null>(null);
  const linkActive = editor.isActive("link");
  const highlightActive = editor.isActive("noteHighlight");
  const textColorActive = editor.isActive("noteTextColor");
  const above = !isModal || anchor.top >= 56;
  const top = !isModal ? -8 : above ? anchor.top - 8 : anchor.bottom + 8;
  const togglePanel = (next: "highlight" | "textColor" | "link") => setPanel((current) => current === next ? null : next);

  return (
    <div
      className={"notespace-note-ui absolute left-1/2 z-20 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1 rounded-xl border border-line bg-surface p-1 [box-shadow:var(--shadow-popup)] " + (above ? "-translate-y-full flex-col-reverse" : "flex-col")}
      style={{ top }}
      role="toolbar"
      aria-label="Note formatting"
      onMouseDown={keepSelection}
    >
      <div className="flex flex-nowrap items-center gap-0.5">
        {FORMAT_MARKS.map(({ label, mark, icon: Icon, run }) => {
          const active = editor.isActive(mark);
          return (
            <button
              key={label}
              type="button"
              className={toolbarButtonClass(active)}
              aria-label={label}
              aria-pressed={active}
              title={label}
              onMouseDown={keepSelection}
              onClick={() => {
                ensureNoteFocus(editor);
                run(editor);
              }}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          );
        })}
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          className={toolbarButtonClass(highlightActive || panel === "highlight")}
          aria-label="Highlight"
          aria-pressed={highlightActive}
          aria-expanded={panel === "highlight"}
          title="Highlight"
          onMouseDown={keepSelection}
          onClick={() => togglePanel("highlight")}
        >
          <Highlighter className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass(textColorActive || panel === "textColor")}
          aria-label="Text color"
          aria-pressed={textColorActive}
          aria-expanded={panel === "textColor"}
          title="Text color"
          onMouseDown={keepSelection}
          onClick={() => togglePanel("textColor")}
        >
          <span className="text-[14px] font-bold leading-none underline decoration-2 underline-offset-2" aria-hidden="true">A</span>
        </button>
        <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          className={toolbarButtonClass(linkActive || panel === "link")}
          aria-label="Link"
          aria-pressed={linkActive}
          aria-expanded={panel === "link"}
          title="Link"
          onMouseDown={keepSelection}
          onClick={() => togglePanel("link")}
        >
          <LinkIcon className="size-4" aria-hidden="true" />
        </button>
        {onExtract && (
          <button
            type="button"
            className={toolbarButtonClass(false)}
            aria-label="Extract"
            title="Extract selection to connected Note"
            onMouseDown={keepSelection}
            onClick={onExtract}
          >
            <Scissors className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {panel === "highlight" && (
        <div className="flex items-center gap-1 px-1" role="group" aria-label="Highlight colors">
          {NOTE_HIGHLIGHT_TONES.map((tone) => {
            const active = editor.isActive("noteHighlight", { tone });
            return (
              <button
                key={tone}
                type="button"
                data-note-highlight-swatch={tone}
                aria-label={`Highlight ${tone}`}
                aria-pressed={active}
                title={tone}
                className={"size-6 rounded-md border transition-transform hover:scale-110 " + (active ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
                onMouseDown={keepSelection}
                onClick={() => {
                  ensureNoteFocus(editor);
                  editor.chain().focus().toggleNoteHighlight(tone).run();
                  setPanel(null);
                }}
              />
            );
          })}
          <button
            type="button"
            className="ml-1 rounded-md px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink"
            aria-label="Clear highlight"
            onMouseDown={keepSelection}
            onClick={() => {
              ensureNoteFocus(editor);
              editor.chain().focus().unsetNoteHighlight().run();
              setPanel(null);
            }}
          >
            Clear
          </button>
        </div>
      )}
      {panel === "textColor" && (
        <div className="flex items-center gap-1 px-1" role="group" aria-label="Text colors">
          {NOTE_TEXT_COLOR_TONES.map((tone) => {
            const active = editor.isActive("noteTextColor", { tone });
            return (
              <button
                key={tone}
                type="button"
                data-note-text-color-swatch={tone}
                aria-label={`Text color ${tone}`}
                aria-pressed={active}
                title={tone}
                className={"grid size-6 place-items-center rounded-md border border-line bg-canvas text-[13px] font-bold leading-none transition-transform hover:scale-110 " + (active ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
                onMouseDown={keepSelection}
                onClick={() => {
                  ensureNoteFocus(editor);
                  if (active) editor.chain().focus().unsetNoteTextColor().run();
                  else editor.chain().focus().setNoteTextColor(tone).run();
                  setPanel(null);
                }}
              >
                A
              </button>
            );
          })}
          <button
            type="button"
            className="ml-1 rounded-md px-1.5 py-1 text-[10px] text-muted hover:bg-tint hover:text-ink"
            aria-label="Reset text color"
            onMouseDown={keepSelection}
            onClick={() => {
              ensureNoteFocus(editor);
              editor.chain().focus().unsetNoteTextColor().run();
              setPanel(null);
            }}
          >
            Reset
          </button>
        </div>
      )}
      {panel === "link" && (
        <div className="flex items-center gap-1 px-1">
          <input
            autoFocus
            className="h-7 w-56 rounded-md border border-line bg-canvas px-2 text-[11px] text-ink outline-none focus:border-accent"
            value={linkURL}
            onChange={(event) => onLinkURLChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onApplyLink();
                setPanel(null);
              }
            }}
            placeholder="Paste a link, or /workspaces/…"
            aria-label="Link URL"
          />
          {linkActive && (
            <button
              type="button"
              className="rounded-md px-1.5 py-1 text-[10px] text-danger hover:bg-tint"
              onMouseDown={keepSelection}
              onClick={() => {
                onUnlink();
                setPanel(null);
              }}
            >
              Unlink
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NoteTableToolbar({ editor, isModal }: { editor: Editor; isModal: boolean }) {
  return (
    <div
      className={
        "notespace-note-ui absolute z-20 flex items-center gap-0.5 rounded-lg border border-line bg-surface px-1.5 py-1 [box-shadow:var(--shadow-popup)] "
        + (isModal ? "right-2 top-1" : "bottom-full left-2 mb-1")
      }
      role="toolbar"
      aria-label="Note table actions"
    >
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>Row +</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Delete table row" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>Row -</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Add table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>Column +</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink" aria-label="Delete table column" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>Col -</button>
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
  const isEditing = prompt.pos !== undefined;
  return (
    <div
      className="notespace-note-ui absolute z-20 grid min-w-56 gap-1.5 rounded-lg border border-line bg-surface p-2 [box-shadow:var(--shadow-popup)]"
      style={{ left: prompt.position.left, top: prompt.position.top }}
      role="dialog"
      aria-label={isEditing ? "Edit Math formula" : "Insert Math formula"}
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
        <button type="button" className="rounded bg-accent px-2 py-0.5 text-[10px] text-surface" onClick={onSubmit}>{isEditing ? "Update" : "Insert"}</button>
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
  readDocument: (noteId: string) => NoteDocument | undefined;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onExtractToNote?: (sourceElementId: string, extractedDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onSuccess?: (message: string) => void;
  onError: (message: string) => void;
  onEscape: () => void;
}) {
  const {
    note,
    elementId,
    workspaceId,
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
  const [referenceState, setReferenceState] = useState<ReferenceState | null>(null);
  const [referenceResults, setReferenceResults] = useState<NoteSummary[]>([]);
  const [blockResults, setBlockResults] = useState<NoteBlockSummary[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [referenceIndex, setReferenceIndex] = useState(0);
  const [mathPrompt, setMathPrompt] = useState<MathPromptState | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const appliedNoteIdRef = useRef(note.id);
  const appliedRevisionRef = useRef(note.revision);
  const activationPointRef = useRef<NoteActivationPoint | null | undefined>(activationPoint);
  const referenceResultsRef = useRef<NoteSummary[]>([]);
  const blockResultsRef = useRef<NoteBlockSummary[]>([]);
  const referencePickRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const onEditMathRef = useRef<(info: NoteMathEditRequest) => void>(() => {});
  const extractingRef = useRef(false);
  const creatingLinkRef = useRef(false);
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

  const syncTriggers = (value: Editor) => {
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
  const syncTriggersRef = useRef(syncTriggers);
  syncTriggersRef.current = syncTriggers;

  // Keep `editorProps` and initial `content` reference-stable so React re-renders do not trigger
  // `@tiptap/react`'s `setOptions` -> `view.setProps` + `view.updateState` on every keystroke/panel toggle.
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
      const normalized = ensureNoteBlockIds(value.getJSON() as NoteDocument);
      if (JSON.stringify(normalized) !== JSON.stringify(value.getJSON())) {
        value.commands.setContent(normalized, { emitUpdate: false });
        onDocumentChangeRef.current(normalized);
      }
    },
  });
  editorRef.current = editor;

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
    referenceResultsRef.current = referenceResults;
  }, [referenceResults]);

  useEffect(() => {
    blockResultsRef.current = blockResults;
  }, [blockResults]);

  useEffect(() => {
    if (!editor) return undefined;
    const point = activationPointRef.current;
    activationPointRef.current = null;
    const frame = window.requestAnimationFrame(() => focusEditorAtPoint(editor, point));
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  const referenceQuery = referenceState?.query ?? "";
  const referenceMode = referenceState?.mode ?? null;
  const referenceStep = referenceState?.step ?? null;
  const referenceTargetNoteId = referenceState?.step === "pick-block" ? referenceState.targetNote.noteId : null;

  useEffect(() => {
    if (!referenceMode || referenceStep !== "pick-note") {
      setReferenceResults([]);
      return undefined;
    }
    const query = referenceQuery.trim();
    let active = true;
    const delay = query ? 90 : 0;
    const timer = window.setTimeout(() => {
      void listNotes({ q: query || undefined, limit: 8 })
        .then((notes) => {
          if (!active) return;
          const filtered = notes.filter((summary) => (
            Boolean(summary.id) && (referenceMode !== "slash-embed" || summary.id !== note.id)
          ));
          setReferenceResults(filtered.slice(0, 8));
        })
        .catch(() => {
          if (active) setReferenceResults([]);
        });
    }, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [note.id, referenceMode, referenceQuery, referenceStep]);

  useEffect(() => {
    if (referenceStep !== "pick-block" || !referenceTargetNoteId) {
      setBlockResults([]);
      setBlocksLoading(false);
      return undefined;
    }
    let active = true;
    setBlocksLoading(true);
    setBlockResults([]);
    void getNote(referenceTargetNoteId)
      .then((target) => {
        if (!active) return;
        setBlockResults(listNoteBlocks(target.document));
        setBlocksLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setBlockResults([]);
        setBlocksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [referenceStep, referenceTargetNoteId]);

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
      // Compare against the store's current document, not this render's prop: keystrokes queued after
      // this render was scheduled are newer than `note.document`, and rewinding to the prop drops them.
      const current = readDocument(note.id) ?? note.document;
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(current)) editor.commands.setContent(current, { emitUpdate: false });
      appliedNoteIdRef.current = note.id;
      appliedRevisionRef.current = note.revision;
    }
  }, [editor, note.id, note.revision, note.document, readDocument]);

  const mentionMatchRange = useCallback(() => {
    if (!editor) return null;
    const beforeCaret = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
    const mention = noteMentionQuery(beforeCaret);
    if (!mention) return null;
    return {
      from: Math.max(1, editor.state.selection.from - mention.matchLength),
      to: editor.state.selection.from,
    };
  }, [editor]);

  const insertInternalNoteLink = useCallback((targetNoteId: string, targetWorkspaceId: string, label: string, from: number, to: number) => {
    if (!editor) return;
    const href = `/workspaces/${encodeURIComponent(targetWorkspaceId)}?noteId=${encodeURIComponent(targetNoteId)}`;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, label)
      .setTextSelection({ from, to: from + label.length })
      .setLink({ href })
      .setTextSelection(from + label.length)
      .run();
  }, [editor]);

  const applyReference = useCallback((summary: NoteSummary, action: "link" | "embed" | "block" = "link") => {
    if (!editor || !summary.id) return;
    if (action === "embed" && summary.id === note.id) {
      onError("A Note cannot embed itself.");
      return;
    }
    const label = noteSummaryLabel(summary);
    const targetWorkspace = noteSummaryWorkspace(summary, workspaceId);
    if (action === "block") {
      setReferenceIndex(0);
      setReferenceState((previous) => {
        if (!previous || previous.step !== "pick-note") return previous;
        if (previous.mode === "slash-embed") return previous;
        return {
          mode: previous.mode,
          ...(previous.mode === "mention" ? { trigger: previous.trigger, matchLength: previous.matchLength } : {}),
          query: previous.query,
          step: "pick-block",
          targetNote: { noteId: summary.id, workspaceId: targetWorkspace, label },
          position: previous.position,
        };
      });
      return;
    }
    if (referenceState?.mode === "slash-embed") {
      editor.chain().focus().insertContent({
        type: "noteEmbed",
        attrs: { noteId: summary.id, workspaceId: targetWorkspace, label },
      }).run();
      setReferenceState(null);
      return;
    }
    const range = mentionMatchRange();
    if (!range) return;
    if (action === "embed") {
      editor.chain().focus().deleteRange(range).insertContentAt(range.from, {
        type: "noteEmbed",
        attrs: { noteId: summary.id, workspaceId: targetWorkspace, label },
      }).run();
    } else {
      insertInternalNoteLink(summary.id, targetWorkspace, label, range.from, range.to);
    }
    setReferenceState(null);
  }, [editor, insertInternalNoteLink, mentionMatchRange, note.id, onError, referenceState?.mode, workspaceId]);

  const applyBlockReference = useCallback((block: NoteBlockSummary) => {
    if (!editor || referenceState?.step !== "pick-block") return;
    const { targetNote, mode } = referenceState;
    const node = {
      type: "noteBlockReference",
      attrs: {
        noteId: targetNote.noteId,
        workspaceId: targetNote.workspaceId,
        blockId: block.blockId,
      },
    };
    if (mode === "slash-block-ref") {
      editor.chain().focus().insertContent(node).run();
      setReferenceState(null);
      return;
    }
    const range = mentionMatchRange();
    if (!range) return;
    editor.chain().focus().deleteRange(range).insertContentAt(range.from, node).run();
    setReferenceState(null);
  }, [editor, mentionMatchRange, referenceState]);

  const createAndLinkQuery = useCallback(async (rawQuery: string) => {
    if (!editor || !onCreateAndLinkNote || creatingLinkRef.current) return;
    const title = rawQuery.trim();
    if (!title) return;
    const range = mentionMatchRange();
    if (!range) return;
    creatingLinkRef.current = true;
    try {
      const initialDocument = ensureNoteBlockIds({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
      });
      const created = await onCreateAndLinkNote(elementId, initialDocument);
      if (!created || editor.isDestroyed) return;
      const latestRange = mentionMatchRange() ?? range;
      insertInternalNoteLink(created.noteId, workspaceId, title, latestRange.from, latestRange.to);
      setReferenceState(null);
    } finally {
      creatingLinkRef.current = false;
    }
  }, [editor, elementId, insertInternalNoteLink, mentionMatchRange, onCreateAndLinkNote, workspaceId]);

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
      if (!created || editor.isDestroyed) return;
      const label = noteFirstLine(extractedDoc) || "Extracted Note";
      const href = `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(created.noteId)}`;
      const extractedResult = extractBlocksFromDocument(currentDoc, { startIndex, endIndex }, {
        leaveLink: { href, label },
      });
      if (!extractedResult) return;
      editor.commands.setContent(ensureNoteBlockIds(extractedResult.remaining), { emitUpdate: true });
      onSuccess?.("Extracted selection to a connected Note.");
    } finally {
      extractingRef.current = false;
    }
  }, [editor, elementId, onError, onExtractToNote, onSuccess, workspaceId]);

  const canCreateAndLink = referenceState?.mode === "mention"
    && referenceState.step === "pick-note"
    && referenceState.query.trim().length > 0
    && Boolean(onCreateAndLinkNote);

  useEffect(() => {
    referencePickRef.current = () => {
      if (!referenceState) return;
      if (referenceState.step === "pick-block") {
        const blocks = blockResultsRef.current;
        const chosen = blocks[referenceIndex % Math.max(1, blocks.length)];
        if (chosen) applyBlockReference(chosen);
        return;
      }
      const results = referenceResultsRef.current;
      const total = results.length + (canCreateAndLink ? 1 : 0);
      if (total === 0) return;
      const activeIndex = referenceIndex % total;
      if (canCreateAndLink && activeIndex === results.length) {
        void createAndLinkQuery(referenceState.query);
        return;
      }
      const result = results[activeIndex];
      if (!result) return;
      const action = referenceState.mode === "slash-embed"
        ? "embed"
        : referenceState.mode === "slash-block-ref"
          ? "block"
          : "link";
      applyReference(result, action);
    };
  }, [applyBlockReference, applyReference, canCreateAndLink, createAndLinkQuery, referenceIndex, referenceState]);

  if (!editor) return null;

  const isModal = bodyMaxHeight === undefined;
  const visibleCommands = slash ? filterNoteSlashCommands(slash.query) : [];

  const executeSlashCommand = (commandId: NoteSlashCommandId) => {
    switch (commandId) {
      case "heading1":
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        return;
      case "heading2":
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        return;
      case "heading3":
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        return;
      case "bulletList":
        editor.chain().focus().toggleBulletList().run();
        return;
      case "orderedList":
        editor.chain().focus().toggleOrderedList().run();
        return;
      case "taskList":
        editor.chain().focus().toggleTaskList().run();
        return;
      case "toggle":
        editor.chain().focus().insertNoteToggle().run();
        return;
      case "codeBlock":
        editor.chain().focus().toggleCodeBlock().run();
        return;
      case "blockquote":
        editor.chain().focus().toggleBlockquote().run();
        return;
      case "callout":
        editor.chain().focus().wrapIn("noteCallout", { tone: "note" }).run();
        return;
      case "divider":
        editor.chain().focus().setHorizontalRule().run();
        return;
      case "table":
        editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
        return;
      case "image":
        imageInputRef.current?.click();
        return;
      case "math":
        setMathPrompt({ latex: "x^2", block: false, error: null, position: slashPosition });
        return;
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
        if (mathPrompt.block) {
          editor.chain().focus().updateBlockMath({ pos: mathPrompt.pos, latex }).run();
        } else {
          editor.chain().focus().updateInlineMath({ pos: mathPrompt.pos, latex }).run();
        }
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

  const totalReferenceItems = referenceResults.length + (canCreateAndLink ? 1 : 0);

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
        <div
          className="notespace-note-ui absolute z-20 grid min-w-56 max-w-80 gap-1 rounded-lg border border-line bg-surface p-1.5 [box-shadow:var(--shadow-popup)]"
          style={{ left: referenceState.position.left, top: referenceState.position.top }}
          role="listbox"
          aria-label="Canvas Note references"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setReferenceState(null);
              editor.commands.focus();
            }
          }}
        >
          {referenceState.step === "pick-note" && (referenceState.mode === "slash-embed" || referenceState.mode === "slash-block-ref") && (
            <input
              autoFocus
              className="h-6 w-full rounded border border-line bg-canvas px-1.5 text-[10px] text-ink outline-none focus:border-accent"
              value={referenceState.query}
              onChange={(event) => {
                setReferenceIndex(0);
                setReferenceState((current) => current?.step === "pick-note" ? { ...current, query: event.target.value } : current);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && totalReferenceItems > 0) {
                  event.preventDefault();
                  setReferenceIndex((value) => value + 1);
                } else if (event.key === "ArrowUp" && totalReferenceItems > 0) {
                  event.preventDefault();
                  setReferenceIndex((value) => Math.max(0, value - 1));
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setReferenceState(null);
                  editor.commands.focus();
                } else if (event.key === "Enter" && referenceResults.length > 0) {
                  event.preventDefault();
                  const chosen = referenceResults[referenceIndex % referenceResults.length];
                  if (chosen) applyReference(chosen, referenceState.mode === "slash-embed" ? "embed" : "block");
                }
              }}
              placeholder={referenceState.mode === "slash-embed" ? "Search Note to embed…" : "Search Note for block…"}
              aria-label={referenceState.mode === "slash-embed" ? "Search Note to embed" : "Search Note for block"}
            />
          )}
          {referenceState.step === "pick-note" && (
            <>
              {referenceResults.map((summary, index) => {
                const label = noteSummaryLabel(summary);
                const active = totalReferenceItems > 0 && index === referenceIndex % totalReferenceItems;
                return (
                  <div key={summary.id} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] ${active ? "bg-tint" : ""}`}>
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate px-1 text-left text-ink hover:text-accent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyReference(
                        summary,
                        referenceState.mode === "slash-embed"
                          ? "embed"
                          : referenceState.mode === "slash-block-ref"
                            ? "block"
                            : "link",
                      )}
                    >
                      {label}
                    </button>
                    {referenceState.mode === "mention" && summary.id !== note.id && (
                      <button
                        type="button"
                        className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyReference(summary, "embed")}
                      >
                        Embed
                      </button>
                    )}
                    {referenceState.mode === "mention" && (
                      <button
                        type="button"
                        className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyReference(summary, "block")}
                      >
                        Block
                      </button>
                    )}
                    {referenceState.mode === "mention" && onPlaceLinkedNote && (
                      <button
                        type="button"
                        className="rounded px-1 text-muted hover:bg-surface hover:text-accent"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setReferenceState(null);
                          void onPlaceLinkedNote(summary.id);
                        }}
                      >
                        Place
                      </button>
                    )}
                  </div>
                );
              })}
              {canCreateAndLink && (
                <button
                  type="button"
                  className={`rounded px-2 py-1 text-left text-[10px] font-medium text-accent hover:bg-tint ${
                    totalReferenceItems > 0 && referenceIndex % totalReferenceItems === referenceResults.length ? "bg-tint" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => { void createAndLinkQuery(referenceState.query); }}
                >
                  {`Create & link "${referenceState.query.trim()}"`}
                </button>
              )}
              {referenceResults.length === 0 && !canCreateAndLink && (
                <span className="px-2 py-1 text-[10px] text-muted">
                  {referenceState.query.trim() ? "No matching Notes." : "Type a Note title…"}
                </span>
              )}
            </>
          )}
          {referenceState.step === "pick-block" && (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-line px-1 pb-1">
                <button
                  type="button"
                  className="rounded px-1 py-0.5 text-[10px] text-muted hover:bg-tint hover:text-ink"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setReferenceIndex(0);
                    setReferenceState((current) => {
                      if (current?.step !== "pick-block") return current;
                      if (current.mode === "mention") {
                        return {
                          mode: "mention",
                          trigger: current.trigger ?? "[[",
                          matchLength: current.matchLength ?? 2,
                          query: current.query,
                          step: "pick-note",
                          position: current.position,
                        };
                      }
                      return {
                        mode: "slash-block-ref",
                        query: current.query,
                        step: "pick-note",
                        position: current.position,
                      };
                    });
                  }}
                >
                  Back
                </button>
                <span className="min-w-0 flex-1 truncate text-right text-[10px] font-medium text-muted">
                  {referenceState.targetNote.label}
                </span>
              </div>
              {blocksLoading ? (
                <span className="px-2 py-1 text-[10px] text-muted">Loading blocks…</span>
              ) : blockResults.length > 0 ? (
                <div className="grid max-h-48 gap-0.5 overflow-y-auto overscroll-contain">
                  {blockResults.map((block, index) => (
                    <button
                      key={block.blockId}
                      type="button"
                      className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint ${
                        index === referenceIndex % blockResults.length ? "bg-tint text-accent" : ""
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyBlockReference(block)}
                    >
                      <span className="min-w-0 flex-1 truncate">{block.preview}</span>
                      <span className="shrink-0 text-[9px] text-muted">{block.type}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="px-2 py-1 text-[10px] text-muted">No blocks in this Note.</span>
              )}
            </>
          )}
        </div>
      )}
      {slash && visibleCommands.length > 0 && (
        <div
          className="notespace-note-ui absolute z-20 grid max-h-60 min-w-44 gap-0.5 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 [box-shadow:var(--shadow-popup)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ left: slashPosition.left, top: slashPosition.top }}
          role="menu"
          aria-label="Note slash commands"
        >
          {visibleCommands.map((command, index) => {
            const Icon = NOTE_SLASH_ICONS[command.id];
            return (
              <button
                key={command.id}
                type="button"
                className={"flex items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] text-ink hover:bg-tint " + (index === slash.index % visibleCommands.length ? "bg-tint text-accent" : "")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runSlashCommand(command.id)}
              >
                <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                {command.label}
              </button>
            );
          })}
        </div>
      )}
      <div
        data-note-scroll=""
        className="overflow-y-auto overscroll-contain"
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

function NoteCardStatus({
  entry,
  onRetry,
  onRemoveMissing,
  onRestore,
}: {
  entry: Exclude<CanvasNoteEntry, { status: "ready" }>;
  onRetry: () => void;
  onRemoveMissing?: () => void;
  onRestore?: () => void;
}) {
  if (entry.status === "trashed") {
    return <div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="status">
      <span>This Note is in Trash.</span>
      <div className="flex flex-wrap gap-1.5">
        {onRestore && (
          <button type="button" className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-accent hover:bg-tint" onClick={onRestore}>
            Restore
          </button>
        )}
        {onRemoveMissing && (
          <button type="button" className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-danger hover:bg-tint" onClick={onRemoveMissing}>
            Remove from canvas
          </button>
        )}
      </div>
    </div>;
  }
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
  return <p className={"m-0 px-3.5 py-2.5 font-semibold leading-tight text-ink " + (lines === 1 ? "truncate" : "line-clamp-2")} style={{ fontSize: noteCardLabelFontSize(zoom, lines === 1) }} data-note-label="">{label}</p>;
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
  expanded: boolean;
  activationPoint?: NoteActivationPoint | null;
  highlightBlockId?: string | null;
  onEditingChange: (elementId: string | null) => void;
  onExpand?: (elementId: string) => void;
  onDocumentChange: (noteId: string, document: NoteDocument) => void;
  readDocument: (noteId: string) => NoteDocument | undefined;
  onRetry: (noteId: string) => void;
  onRestore?: (noteId: string) => void;
  onRemoveMissing?: (elementId: string) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onExtractToNote?: (sourceElementId: string, extractedDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onSuccess?: (message: string) => void;
  onError: (message: string) => void;
};

function NoteCardBody({
  elementId,
  entry,
  editable,
  folded,
  detail,
  zoom,
  bodyMaxHeight,
  highlightBlockId,
  onDocumentChange,
  onAutoResize,
  onRetry,
  onRemoveMissing,
  onRestore,
  renderEditor,
}: {
  elementId: string;
  entry: CanvasNoteEntry;
  editable: boolean;
  folded: boolean;
  detail: NoteCardDetail;
  zoom: number;
  bodyMaxHeight?: number;
  highlightBlockId?: string | null;
  onDocumentChange: (noteId: string, document: NoteDocument) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onRetry: () => void;
  onRemoveMissing?: () => void;
  onRestore?: () => void;
  renderEditor: (note: Note) => ReactNode;
}) {
  const readScrollRef = useRef<HTMLDivElement>(null);
  const readAutoFitActive = !editable && !folded && detail !== "label" && entry.status === "ready";
  const readyDocument = entry.status === "ready" ? entry.note.document : null;

  useEffect(() => {
    if (!readAutoFitActive || typeof ResizeObserver === "undefined") return;
    const contentNode = readScrollRef.current?.querySelector<HTMLElement>(".notespace-note-content");
    if (!contentNode) return;
    const reportSize = () => {
      onAutoResize(elementId, Math.max(NOTE_CARD_MIN_HEIGHT, Math.ceil(contentNode.scrollHeight + 24)));
    };
    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [readAutoFitActive, elementId, onAutoResize, readyDocument]);

  if (entry.status !== "ready") return <NoteCardStatus entry={entry} onRetry={onRetry} onRemoveMissing={onRemoveMissing} onRestore={onRestore} />;
  if (editable) return renderEditor(entry.note);
  if (folded) return <NoteLabel document={entry.note.document} zoom={zoom} lines={1} />;
  if (detail === "label") return <NoteLabel document={entry.note.document} zoom={zoom} lines={2} />;
  const readyNote = entry.note;
  return (
    <div
      ref={readScrollRef}
      data-note-scroll=""
      className="overflow-y-auto overscroll-contain"
      style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}
    >
      <NoteReadView
        document={readyNote.document}
        highlightBlockId={highlightBlockId}
        onToggleTask={(target) => {
          const nextDoc = toggleTaskInDocument(readyNote.document, target);
          if (nextDoc !== readyNote.document) onDocumentChange(readyNote.id, nextDoc);
        }}
        onToggleCollapse={(blockId, open) => {
          const nextDoc = toggleNoteToggleInDocument(readyNote.document, blockId, open);
          if (nextDoc !== readyNote.document) onDocumentChange(readyNote.id, nextDoc);
        }}
      />
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
  expanded,
  activationPoint,
  highlightBlockId,
  onEditingChange,
  onExpand,
  onDocumentChange,
  readDocument,
  onRetry,
  onRestore,
  onRemoveMissing,
  onAutoResize,
  onPlaceLinkedNote,
  onExtractToNote,
  onCreateAndLinkNote,
  onSuccess,
  onError,
}: CanvasNoteCardProps) {
  const folded = reference.compact === true;
  const editable = editing && !expanded && entry.status === "ready";
  const collapsed = folded && !editable;
  const frame = noteCardFrame(element, viewport, collapsed);
  const bodyMaxHeight = noteCardBodyMaxHeight(element.height, collapsed, reference.heightMode);
  const style = {
    ...frame,
    ...(reference.heightMode === "fixed" && !collapsed ? { height: element.height } : {}),
  } as CSSProperties;
  const frameClass = "absolute border bg-surface text-ink "
    + (reference.shape === "square" ? "rounded-none " : "rounded-lg ")
    + (collapsed ? "overflow-hidden " : "overflow-visible ")
    + (selected || editable ? "border-accent/70 ring-2 ring-accent/15" : "border-line")
    + (editable ? " pointer-events-auto" : " pointer-events-none");

  return (
    <article
      className={frameClass}
      style={style}
      data-note-element={element.id}
      data-note-compact={folded || undefined}
      data-note-height-mode={reference.heightMode ?? "auto"}
      data-note-color={reference.color && reference.color !== "default" ? reference.color : undefined}
      data-note-shape={reference.shape === "square" ? "square" : undefined}
      data-note-selected={selected ? "true" : undefined}
      data-note-editing={editable ? "true" : undefined}
      data-note-state={entry.status}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") onEditingChange(null); }}
    >
      {editable && viewport.zoom < 0.75 && onExpand && (
        <button
          type="button"
          className="notespace-note-ui pointer-events-auto absolute right-0 bottom-full z-10 mb-1 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted hover:bg-tint hover:text-accent"
          aria-label="Expand Note"
          title="Expand Note (Shift+Enter)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onExpand(element.id);
          }}
        >
          <Maximize2 className="size-3" aria-hidden="true" />
          <span>Expand</span>
        </button>
      )}
      <NoteCardBody
        elementId={element.id}
        entry={entry}
        editable={editable}
        folded={collapsed}
        detail={noteCardDetail(viewport.zoom, editable)}
        zoom={viewport.zoom}
        bodyMaxHeight={bodyMaxHeight}
        highlightBlockId={highlightBlockId}
        onDocumentChange={onDocumentChange}
        onAutoResize={onAutoResize}
        onRetry={() => onRetry(reference.noteId)}
        onRemoveMissing={onRemoveMissing ? () => onRemoveMissing(element.id) : undefined}
        onRestore={onRestore ? () => onRestore(reference.noteId) : undefined}
        renderEditor={(note) => (
          <NoteEditor
            note={note}
            elementId={element.id}
            workspaceId={workspaceId}
            activationPoint={activationPoint}
            bodyMaxHeight={bodyMaxHeight}
            onDocumentChange={(document) => onDocumentChange(note.id, document)}
            readDocument={readDocument}
            onAutoResize={onAutoResize}
            onPlaceLinkedNote={onPlaceLinkedNote}
            onExtractToNote={onExtractToNote}
            onCreateAndLinkNote={onCreateAndLinkNote}
            onSuccess={onSuccess}
            onError={onError}
            onEscape={() => onEditingChange(null)}
          />
        )}
      />
      <NoteSaveIndicator state={saveState} />
    </article>
  );
}

const ignoreAutoResize = () => {};

export function CanvasNoteCardLayer({
  elements,
  workspaceId,
  viewport,
  selectedElementId,
  editingElementId,
  expandedElementId = null,
  infoNoteId = null,
  trashNoteId = null,
  activationPoint,
  highlightNoteId = null,
  highlightBlockId = null,
  onEditingChange,
  onExpandedChange,
  onInfoNoteChange,
  onTrashNoteChange,
  onFocusNote,
  onRegisterFlush,
  onRegisterDocuments,
  onUpdateNote,
  onSaveState,
  onAutoResize,
  onRemoveMissing,
  onPlaceLinkedNote,
  onExtractToNote,
  onCreateAndLinkNote,
  onSuccess,
  onError,
}: {
  elements: readonly OrderedExcalidrawElement[];
  workspaceId: string;
  viewport: CanvasViewport;
  selectedElementId: string | null;
  editingElementId: string | null;
  expandedElementId?: string | null;
  infoNoteId?: string | null;
  /** A Note the toolbar asked to move to Trash; the layer owns the store, so it performs the move. */
  trashNoteId?: string | null;
  activationPoint?: NoteActivationPoint | null;
  highlightNoteId?: string | null;
  highlightBlockId?: string | null;
  onEditingChange: (elementId: string | null) => void;
  onExpandedChange?: (elementId: string | null) => void;
  onInfoNoteChange?: (noteId: string | null) => void;
  onTrashNoteChange?: (noteId: string | null) => void;
  onFocusNote?: (noteId: string) => void;
  onRegisterFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onRegisterDocuments?: (read: () => Record<string, NoteDocument>) => (() => void) | void;
  onUpdateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  onSaveState?: (status: NoteSaveStatus) => void;
  onAutoResize?: (elementId: string, height: number) => void;
  onRemoveMissing?: (elementId: string) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onExtractToNote?: (sourceElementId: string, extractedDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onSuccess?: (message: string) => void;
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

  const restoreNote = useCallback((noteId: string) => {
    store.restore(noteId).then(
      () => onSuccess?.("Note restored."),
      (error: unknown) => onError(error instanceof Error && error.message ? error.message : "Could not restore this Note."),
    );
  }, [store, onSuccess, onError]);
  useEffect(() => {
    if (!trashNoteId) return;
    let active = true;
    store.trash(trashNoteId).then(
      () => { if (active) onSuccess?.("Note moved to Trash. Restore it from the card or Settings."); },
      (error: unknown) => { if (active) onError(error instanceof Error && error.message ? error.message : "Could not move this Note to Trash."); },
    ).finally(() => { if (active) onTrashNoteChange?.(null); });
    return () => { active = false; };
  }, [trashNoteId, store, onSuccess, onError, onTrashNoteChange]);
  useEffect(() => onRegisterFlush?.(() => store.flushAll()), [onRegisterFlush, store]);
  useEffect(() => onRegisterDocuments?.(() => store.getDocuments()), [onRegisterDocuments, store]);

  const expandedTarget = useMemo(
    () => (expandedElementId ? noteElements.find(({ element }) => element.id === expandedElementId) ?? null : null),
    [expandedElementId, noteElements],
  );
  useEffect(() => {
    if (expandedElementId && !expandedTarget) onExpandedChange?.(null);
  }, [expandedElementId, expandedTarget, onExpandedChange]);

  const expandedEntry = expandedTarget
    ? (snapshot.entries[expandedTarget.reference.noteId] ?? { status: "loading" as const })
    : null;
  const expandedReadyNote = expandedEntry?.status === "ready" ? expandedEntry.note : null;

  const infoEntry = infoNoteId ? snapshot.entries[infoNoteId] : undefined;
  const infoNoteLabel = infoEntry?.status === "ready" ? noteFirstLine(infoEntry.note.document) : undefined;

  return (
    <CanvasNoteStoreProvider value={store}>
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-visible" aria-label="Canvas notes">
        {noteElements.map(({ element, reference }) => (
          <CanvasNoteCard
            key={element.id}
            element={element}
            reference={reference}
            entry={snapshot.entries[reference.noteId] ?? { status: "loading" }}
            saveState={snapshot.saves[reference.noteId]}
            workspaceId={workspaceId}
            viewport={viewport}
            selected={selectedElementId === element.id}
            editing={editingElementId === element.id}
            expanded={expandedElementId === element.id}
            activationPoint={editingElementId === element.id ? activationPoint : null}
            highlightBlockId={highlightNoteId === reference.noteId ? highlightBlockId : null}
            onEditingChange={onEditingChange}
            onExpand={onExpandedChange ? (elementId) => onExpandedChange(elementId) : undefined}
            onDocumentChange={store.queue}
            readDocument={store.readDocument}
            onRetry={store.retry}
            onRestore={restoreNote}
            onRemoveMissing={onRemoveMissing}
            onAutoResize={onAutoResize ?? ignoreAutoResize}
            onPlaceLinkedNote={onPlaceLinkedNote}
            onExtractToNote={onExtractToNote}
            onCreateAndLinkNote={onCreateAndLinkNote}
            onSuccess={onSuccess}
            onError={onError}
          />
        ))}
      </div>
      {expandedTarget && expandedEntry && (
        <NoteFocusModal
          open={Boolean(expandedTarget) && !infoNoteId}
          onOpenChange={(open) => {
            if (!open) onExpandedChange?.(null);
          }}
          label={expandedReadyNote ? noteFirstLine(expandedReadyNote.document) : undefined}
          saveState={expandedReadyNote ? (snapshot.saves[expandedReadyNote.id] ?? "saved") : "saved"}
          onOpenInfo={onInfoNoteChange && expandedReadyNote ? () => onInfoNoteChange(expandedReadyNote.id) : undefined}
        >
          {expandedEntry.status === "ready" ? (
            <NoteEditor
              key={expandedTarget.element.id}
              note={expandedEntry.note}
              elementId={expandedTarget.element.id}
              workspaceId={workspaceId}
              bodyMaxHeight={undefined}
              onDocumentChange={(document) => store.queue(expandedEntry.note.id, document)}
              readDocument={store.readDocument}
              onAutoResize={ignoreAutoResize}
              onPlaceLinkedNote={onPlaceLinkedNote}
              onExtractToNote={onExtractToNote}
              onCreateAndLinkNote={onCreateAndLinkNote}
              onSuccess={onSuccess}
              onError={onError}
              onEscape={() => onExpandedChange?.(null)}
            />
          ) : (
            <NoteCardStatus
              entry={expandedEntry}
              onRetry={() => store.retry(expandedTarget.reference.noteId)}
              onRestore={() => restoreNote(expandedTarget.reference.noteId)}
              onRemoveMissing={onRemoveMissing ? () => {
                onExpandedChange?.(null);
                onRemoveMissing(expandedTarget.element.id);
              } : undefined}
            />
          )}
        </NoteFocusModal>
      )}
      <NoteInfoPopover
        open={Boolean(infoNoteId)}
        onOpenChange={(open) => {
          if (!open) onInfoNoteChange?.(null);
        }}
        noteId={infoNoteId}
        noteLabel={infoNoteLabel}
        currentWorkspaceId={workspaceId}
        onFocusNote={onFocusNote}
      />
    </CanvasNoteStoreProvider>
  );
}
