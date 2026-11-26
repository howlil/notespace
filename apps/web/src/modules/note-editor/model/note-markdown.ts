import { Marked, type Tokens } from "marked";

type Token = Tokens.Generic;
import {
  NOTE_HIGHLIGHT_TONES,
  NOTE_TEXT_COLOR_TONES,
  normalizeNoteHexColor,
  type NoteDocument,
  type NoteHighlightValue,
  type NoteTextColorValue,
} from "../../../entities/note.ts";

/**
 * Notes are Markdown and nothing else. Rendering and export lex the text with marked and read
 * the resulting tokens directly; nothing here is persisted or becomes a second source of truth.
 *
 * Beyond CommonMark/GFM the Note contract adds, each as plain Markdown text:
 *   `$x$` / `$$ … $$`        math (KaTeX)
 *   `> [!tone]`              callout (note, info, tip, warning, danger)
 *   `<details open>` blocks  toggles, `<summary>` is the title
 *   `<u>`, `<mark data-tone>`, `<span data-color>`  underline, highlight, text colour
 *   `… ^id`                  block identity, the target of block references
 *   `![t](/workspaces/<w>?noteId=<id>)`            embed of another Note
 *   `[t](/workspaces/<w>?noteId=<id>&blockId=<b>)` reference to a block of another Note
 */
export type NoteToken = Tokens.Generic & { blockId?: string };

const blockMath = {
  name: "blockMath",
  level: "block" as const,
  start: (src: string) => src.indexOf("$$"),
  tokenizer(src: string) {
    const match = /^\$\$[ \t]*\n([\s\S]+?)\n[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src);
    return match ? { type: "blockMath", raw: match[0], text: match[1].trim() } : undefined;
  },
};

const inlineMath = {
  name: "inlineMath",
  level: "inline" as const,
  start: (src: string) => src.indexOf("$"),
  tokenizer(src: string) {
    const match = /^\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(src);
    return match ? { type: "inlineMath", raw: match[0], text: match[1] } : undefined;
  },
};

const notes = new Marked({ gfm: true, extensions: [blockMath, inlineMath] });

export function lexNote(document: NoteDocument): Token[] {
  try {
    return notes.lexer(document.text) as Token[];
  } catch {
    return [{ type: "paragraph", raw: document.text, text: document.text, tokens: [{ type: "text", raw: document.text, text: document.text }] }];
  }
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, dec?: string, hex?: string, named?: string) => {
    try {
      if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    } catch {
      return match;
    }
    return named && named in NAMED_ENTITIES ? NAMED_ENTITIES[named] : match;
  });
}

const CALLOUT_TONES: ReadonlySet<string> = new Set(["note", "info", "tip", "warning", "danger"]);
const HIGHLIGHTS: ReadonlySet<string> = new Set(NOTE_HIGHLIGHT_TONES);
const TEXT_COLORS: ReadonlySet<string> = new Set(NOTE_TEXT_COLOR_TONES);

export function highlightTone(value: string | undefined): NoteHighlightValue {
  if (value && HIGHLIGHTS.has(value)) return value as NoteHighlightValue;
  return normalizeNoteHexColor(value) ?? "yellow";
}

export function textColorTone(value: string | undefined): NoteTextColorValue | null {
  if (value && TEXT_COLORS.has(value)) return value as NoteTextColorValue;
  return normalizeNoteHexColor(value);
}

export function isPresetTone(value: string): boolean {
  return HIGHLIGHTS.has(value) || TEXT_COLORS.has(value);
}

export type InlineTag = { name: "u" | "mark" | "span" | "br"; closing: boolean; value?: string };

/** The only inline HTML a Note honours. Anything else is shown as literal text. */
export function parseInlineTag(raw: string): InlineTag | null {
  const match = /^<(\/)?(u|mark|span|br)(?:\s+data-(?:tone|color)="([^"<>]{0,32})")?\s*\/?>$/i.exec(raw.trim());
  if (!match) return null;
  const name = match[2].toLowerCase() as InlineTag["name"];
  if (match[3] !== undefined && name !== "mark" && name !== "span") return null;
  return { name, closing: Boolean(match[1]), ...(match[3] !== undefined ? { value: match[3] } : {}) };
}

/** Plain text of inline tokens, for labels, previews and SVG export. */
export function inlineText(tokens: readonly Token[] | undefined): string {
  let out = "";
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "text":
        out += token.tokens?.length ? inlineText(token.tokens) : decodeEntities(String(token.text ?? ""));
        break;
      case "escape":
      case "inlineMath":
      case "codespan":
        out += String(token.text ?? "");
        break;
      case "br":
        out += "\n";
        break;
      case "html": {
        const tag = parseInlineTag(token.raw);
        if (tag?.name === "br") out += "\n";
        break;
      }
      default:
        out += token.tokens ? inlineText(token.tokens) : decodeEntities(String(token.text ?? ""));
    }
  }
  return out;
}

const BLOCK_ID_MARKER = /(^|\s)\^([A-Za-z0-9_-]+)$/;

/** Splits a trailing ` ^id` marker off a text block. `solo` means the block held only the marker. */
function takeBlockId(token: Token): { token: Token; id: string; solo: boolean } | null {
  const inline = token.tokens;
  const last = inline?.at(-1);
  if (!inline || !last || last.type !== "text") return null;
  const match = BLOCK_ID_MARKER.exec(String(last.text));
  if (!match) return null;
  const text = String(last.text).slice(0, match.index);
  const rest = [...inline.slice(0, -1), ...(text.trim() ? [{ ...last, text, raw: text }] : [])];
  return { token: { ...token, tokens: rest }, id: match[2], solo: rest.length === 0 };
}

type Frame = { summary: string; open: boolean; index: number; raw: string; tokens: NoteToken[] };

const DETAILS_OPEN = /^<details(\s+open)?>\s*<summary>([\s\S]*?)<\/summary>\s*$/i;
const DETAILS_WHOLE = /^<details(\s+open)?>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)\s*<\/details>\s*$/i;
const DETAILS_CLOSE = /^\s*<\/details>\s*$/i;

/**
 * Turns lexer output into the blocks a renderer draws: callouts and toggles are assembled,
 * block identities are attached, and structural noise is dropped. `ctx.details` numbers the
 * toggles in source order so a click can be written back to the text.
 */
export function noteBlocks(tokens: readonly Token[], ctx: { details: number } = { details: 0 }): NoteToken[] {
  const out: NoteToken[] = [];
  const stack: Frame[] = [];
  const sink = () => stack.at(-1)?.tokens ?? out;
  const close = () => {
    const frame = stack.pop();
    if (frame) sink().push({ type: "details", raw: frame.raw, summary: frame.summary, open: frame.open, index: frame.index, tokens: frame.tokens });
  };

  for (const token of tokens) {
    if (token.type === "space" || token.type === "def") continue;

    if (token.type === "html") {
      const raw = token.raw.trim();
      const whole = DETAILS_WHOLE.exec(raw);
      const opener = DETAILS_OPEN.exec(raw);
      if (whole) {
        const index = ctx.details++;
        sink().push({ type: "details", raw: token.raw, summary: decodeEntities(whole[2].trim()), open: Boolean(whole[1]), index, tokens: noteBlocks(notes.lexer(whole[3]), ctx) });
      } else if (opener) {
        stack.push({ summary: decodeEntities(opener[2].trim()), open: Boolean(opener[1]), index: ctx.details++, raw: token.raw, tokens: [] });
      } else if (DETAILS_CLOSE.test(raw) && stack.length) {
        close();
      } else {
        sink().push({ type: "paragraph", raw: token.raw, text: raw, tokens: [{ type: "text", raw: token.raw, text: raw }] });
      }
      continue;
    }

    if (token.type === "paragraph" || token.type === "heading" || token.type === "text") {
      const marked = takeBlockId(token);
      if (marked?.solo && token.type === "paragraph") {
        const previous = sink().at(-1);
        if (previous) previous.blockId = marked.id;
        continue;
      }
      sink().push({ ...(marked?.token ?? token), ...(marked ? { blockId: marked.id } : {}) } as NoteToken);
      continue;
    }

    if (token.type === "blockquote") {
      const callout = /^\[!([A-Za-z0-9_-]+)\][ \t]*(?:\n|$)/.exec(String(token.text));
      if (callout) {
        const tone = CALLOUT_TONES.has(callout[1].toLowerCase()) ? callout[1].toLowerCase() : "note";
        sink().push({ type: "callout", raw: token.raw, tone, tokens: noteBlocks(notes.lexer(String(token.text).slice(callout[0].length)), ctx) });
      } else {
        sink().push({ ...token, tokens: noteBlocks(token.tokens ?? [], ctx) } as NoteToken);
      }
      continue;
    }

    if (token.type === "list") {
      const items = (token.items as Tokens.ListItem[]).map((item) => ({
        ...item,
        tokens: noteBlocks(item.tokens.filter((child) => child.type !== "checkbox"), ctx),
      }));
      sink().push({ ...token, items } as NoteToken);
      continue;
    }

    sink().push(token as NoteToken);
  }
  while (stack.length) close();
  return out;
}

/** Text of a block, flattened, for previews of referenced blocks. */
export function blockText(token: Token): string {
  if (token.tokens && token.type !== "details" && token.type !== "callout" && token.type !== "blockquote") return inlineText(token.tokens);
  const children: Token[] = token.type === "list" ? (token.items as Tokens.ListItem[]).flatMap((item) => item.tokens) : token.tokens ?? [];
  if (token.type === "blockMath" || token.type === "code") return String(token.text ?? "");
  return children.map(blockText).filter(Boolean).join(" ");
}

function findBlock(tokens: readonly Token[], blockId: string): NoteToken | null {
  for (const token of tokens as NoteToken[]) {
    if (token.blockId === blockId) return token;
    const children: Token[] = token.type === "list" ? (token.items as Tokens.ListItem[]).flatMap((item) => item.tokens) : token.tokens ?? [];
    const found = findBlock(children, blockId);
    if (found) return found;
  }
  return null;
}

const BLOCK_PREVIEW_MAX = 120;

/** Preview of the block carrying `^blockId` in another Note, or null when it no longer exists. */
export function findBlockPreview(document: NoteDocument | null | undefined, blockId: string): string | null {
  if (!document || !blockId) return null;
  const block = findBlock(noteBlocks(lexNote(document)), blockId);
  const text = block ? blockText(block).replace(/\s+/g, " ").trim() : "";
  if (!text) return null;
  return text.length > BLOCK_PREVIEW_MAX ? `${text.slice(0, BLOCK_PREVIEW_MAX - 1).trimEnd()}…` : text;
}

export type NoteRoute = { workspaceId: string; noteId: string; blockId: string };

/** Reads `/workspaces/<id>?noteId=<id>[&blockId=<id>]`; `_` as the workspace means none was chosen. */
export function parseNoteRoute(href: string): NoteRoute | null {
  const match = /^\/workspaces\/([^/?#]+)\?(.+)$/.exec(href.trim());
  if (!match) return null;
  const query = new URLSearchParams(match[2]);
  const noteId = query.get("noteId");
  if (!noteId) return null;
  let workspaceId = match[1];
  try {
    workspaceId = decodeURIComponent(workspaceId);
  } catch {
    return null;
  }
  return { workspaceId: workspaceId === "_" ? "" : workspaceId, noteId, blockId: query.get("blockId") ?? "" };
}

const TASK_LINE = /^((?:[ \t]*>)*[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])(\][ \t])/;
const DETAILS_LINE = /^((?:[ \t]*>)*[ \t]{0,3}<details)((?:[ \t]+open)?)(>)/i;

/** Rewrites the nth line (outside code fences) that matches `pattern`; returns the text unchanged otherwise. */
function rewriteNth(text: string, pattern: RegExp, index: number, replacement: (match: RegExpExecArray) => string): string {
  const lines = text.split("\n");
  let fence = "";
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const opener = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(lines[i])?.[1] ?? "";
    if (opener) {
      if (!fence) fence = opener;
      else if (opener[0] === fence[0] && opener.length >= fence.length) fence = "";
      continue;
    }
    if (fence) continue;
    const match = pattern.exec(lines[i]);
    if (!match) continue;
    if (seen === index) {
      lines[i] = replacement(match) + lines[i].slice(match[0].length);
      return lines.join("\n");
    }
    seen += 1;
  }
  return text;
}

/** Checks or unchecks the nth task item (source order) of a Note's Markdown. */
export function toggleNoteTask(text: string, index: number, checked: boolean): string {
  return rewriteNth(text, TASK_LINE, index, (match) => `${match[1]}${checked ? "x" : " "}${match[3]}`);
}

/** Opens or closes the nth `<details>` toggle (source order) of a Note's Markdown. */
export function toggleNoteDetails(text: string, index: number, open: boolean): string {
  return rewriteNth(text, DETAILS_LINE, index, (match) => `${match[1]}${open ? " open" : ""}${match[3]}`);
}
