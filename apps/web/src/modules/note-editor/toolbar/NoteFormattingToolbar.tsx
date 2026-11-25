import type { Editor } from "@tiptap/core";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link as LinkIcon,
  Palette,
  Scissors,
  Strikethrough,
  Underline as UnderlineIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { NOTE_HIGHLIGHT_TONES, NOTE_TEXT_COLOR_TONES, normalizeNoteHexColor } from "../../../entities/note";
import { Input } from "../../../shared/ui";
import type { SelectionAnchor } from "./editor-positioning";

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

export function NoteFormattingToolbar({
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
  const activeCustomHighlight = normalizeNoteHexColor(editor.getAttributes("noteHighlight").tone);
  const activeCustomTextColor = normalizeNoteHexColor(editor.getAttributes("noteTextColor").tone);
  const above = !isModal || anchor.top >= 56;
  const top = above ? anchor.top - 8 : anchor.bottom + 8;
  const togglePanel = (next: "highlight" | "textColor" | "link") => setPanel((current) => current === next ? null : next);

  return (
    <div
      className={"notespace-note-ui absolute z-[var(--z-popover)] flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1 rounded-lg border border-line bg-surface p-1 [box-shadow:var(--shadow-popup)] " + (above ? "-translate-y-full flex-col-reverse" : "flex-col")}
      style={{ top, left: anchor.left }}
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
          <label
            className={"relative grid size-6 cursor-pointer place-items-center rounded-md border border-line bg-canvas text-muted transition-transform hover:scale-110 hover:text-ink " + (activeCustomHighlight ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
            style={activeCustomHighlight ? { backgroundColor: `color-mix(in srgb, ${activeCustomHighlight} 40%, transparent)` } : undefined}
            title={activeCustomHighlight ? `Custom highlight (${activeCustomHighlight})` : "Custom highlight color"}
          >
            <Palette className="size-3.5" aria-hidden="true" />
            <input
              type="color"
              aria-label="Custom highlight color"
              className="sr-only"
              value={activeCustomHighlight ?? "#f59e0b"}
              onChange={(event) => {
                const hex = normalizeNoteHexColor(event.target.value);
                if (!hex) return;
                ensureNoteFocus(editor);
                editor.chain().focus().setNoteHighlight(hex).run();
              }}
            />
          </label>
          <button
            type="button"
            className="ml-1 rounded-md px-1.5 py-1 text-2xs text-muted hover:bg-tint hover:text-ink"
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
          <label
            className={"relative grid size-6 cursor-pointer place-items-center rounded-md border border-line bg-canvas text-muted transition-transform hover:scale-110 hover:text-ink " + (activeCustomTextColor ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : "")}
            style={activeCustomTextColor ? { color: activeCustomTextColor } : undefined}
            title={activeCustomTextColor ? `Custom text color (${activeCustomTextColor})` : "Custom text color"}
          >
            <Palette className="size-3.5" aria-hidden="true" />
            <input
              type="color"
              aria-label="Custom text color"
              className="sr-only"
              value={activeCustomTextColor ?? "#e11d48"}
              onChange={(event) => {
                const hex = normalizeNoteHexColor(event.target.value);
                if (!hex) return;
                ensureNoteFocus(editor);
                editor.chain().focus().setNoteTextColor(hex).run();
              }}
            />
          </label>
          <button
            type="button"
            className="ml-1 rounded-md px-1.5 py-1 text-2xs text-muted hover:bg-tint hover:text-ink"
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
          <Input
            autoFocus
            inputSize="sm"
            className="w-56 bg-canvas px-2 text-xs"
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
              className="rounded-md px-1.5 py-1 text-2xs text-danger hover:bg-tint"
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
