import { Mark, mergeAttributes, type JSONContent, type MarkdownRendererHelpers } from "@tiptap/core";
import {
  NOTE_HIGHLIGHT_TONES,
  NOTE_TEXT_COLOR_TONES,
  normalizeNoteHexColor,
  type NoteHighlightValue,
  type NoteTextColorValue,
} from "../../../entities/note";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteHighlight: {
      setNoteHighlight: (tone?: NoteHighlightValue) => ReturnType;
      toggleNoteHighlight: (tone?: NoteHighlightValue) => ReturnType;
      unsetNoteHighlight: () => ReturnType;
    };
    noteTextColor: {
      setNoteTextColor: (tone: NoteTextColorValue) => ReturnType;
      unsetNoteTextColor: () => ReturnType;
    };
  }
}

const highlightToneSet: ReadonlySet<string> = new Set(NOTE_HIGHLIGHT_TONES);
const textColorToneSet: ReadonlySet<string> = new Set(NOTE_TEXT_COLOR_TONES);

export function normalizeHighlightTone(value: unknown): NoteHighlightValue {
  if (typeof value === "string" && highlightToneSet.has(value)) return value as NoteHighlightValue;
  return normalizeNoteHexColor(value) ?? "yellow";
}

export function normalizeTextColorTone(value: unknown): NoteTextColorValue | null {
  if (typeof value === "string" && textColorToneSet.has(value)) return value as NoteTextColorValue;
  return normalizeNoteHexColor(value);
}

export function isPresetHighlightTone(value: string): boolean {
  return highlightToneSet.has(value);
}

export function isPresetTextColorTone(value: string): boolean {
  return textColorToneSet.has(value);
}

export const NoteHighlight = Mark.create({
  name: "noteHighlight",

  addAttributes() {
    return {
      tone: {
        default: "yellow",
        parseHTML: (element: HTMLElement) => normalizeHighlightTone(element.getAttribute("data-note-highlight")),
        renderHTML: (attributes: { tone?: unknown }) => {
          const tone = normalizeHighlightTone(attributes.tone);
          if (isPresetHighlightTone(tone)) {
            return {
              "data-note-highlight": tone,
              class: `notespace-note-hl notespace-note-hl-${tone}`,
            };
          }
          return {
            "data-note-highlight": tone,
            class: "notespace-note-hl",
            style: `background-color: color-mix(in srgb, ${tone} 34%, transparent)`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: "mark[data-note-highlight]" },
      { tag: "mark" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => `==${helpers.renderChildren(node)}==`,

  addCommands() {
    return {
      setNoteHighlight:
        (tone = "yellow") =>
        ({ commands }) =>
          commands.setMark(this.name, { tone: normalizeHighlightTone(tone) }),
      toggleNoteHighlight:
        (tone = "yellow") =>
        ({ commands }) =>
          commands.toggleMark(this.name, { tone: normalizeHighlightTone(tone) }),
      unsetNoteHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

export const NoteTextColor = Mark.create({
  name: "noteTextColor",

  addAttributes() {
    return {
      tone: {
        default: "muted",
        parseHTML: (element: HTMLElement) => normalizeTextColorTone(element.getAttribute("data-note-text-color")) ?? "muted",
        renderHTML: (attributes: { tone?: unknown }) => {
          const tone = normalizeTextColorTone(attributes.tone);
          if (!tone) return {};
          if (isPresetTextColorTone(tone)) {
            return {
              "data-note-text-color": tone,
              class: `notespace-note-tc notespace-note-tc-${tone}`,
            };
          }
          return {
            "data-note-text-color": tone,
            class: "notespace-note-tc",
            style: `color: ${tone}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-note-text-color]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => helpers.renderChildren(node),

  addCommands() {
    return {
      setNoteTextColor:
        (tone) =>
        ({ commands }) => {
          const normalized = normalizeTextColorTone(tone);
          return normalized ? commands.setMark(this.name, { tone: normalized }) : commands.unsetMark(this.name);
        },
      unsetNoteTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
