import type { Token, Tokens } from "marked";
import {
  isNoteAssetSrc,
  noteFirstLine,
  type NoteCardColor,
  type NoteDocument,
} from "../../../entities/note.ts";
import {
  blockText,
  findBlockPreview,
  inlineText,
  lexNote,
  noteBlocks,
  parseNoteRoute,
  type NoteToken,
} from "../model/note-markdown.ts";
import {
  escapeXml,
  estimateTextWidth,
  truncateLine,
  wrapText,
} from "./svg-text-wrap.ts";

export const NOTE_SVG_FONT_SANS = "Open Sans, system-ui, -apple-system, sans-serif";
export const NOTE_SVG_FONT_MONO = "JetBrains Mono, Cascadia Code, SFMono-Regular, Consolas, monospace";

export type CardPalette = {
  background: string;
  border: string;
};

export type NoteThemePalette = {
  ink: string;
  muted: string;
  border: string;
  quoteBar: string;
  accent: string;
  tint: string;
  codeBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
};

/** Adaptive Note card tints: calm paper-dyed tones in Light mode and atmospheric dark surfaces in Dark mode. */
const LIGHT_CARD_COLORS: Record<NoteCardColor, CardPalette> = {
  default: { background: "#FFFDF9", border: "#E1DACD" },
  blue: { background: "#E4EEF8", border: "#BFD4EC" },
  teal: { background: "#E1F1EE", border: "#B6DBD4" },
  green: { background: "#E7F1E3", border: "#C2DAB9" },
  yellow: { background: "#F8EFC9", border: "#E2CF8A" },
  orange: { background: "#F8E4D4", border: "#E4BE9F" },
  pink: { background: "#F7E3E8", border: "#E2BAC4" },
  purple: { background: "#ECE6F8", border: "#CDC0E9" },
};

const DARK_CARD_COLORS: Record<NoteCardColor, CardPalette> = {
  default: { background: "#24211D", border: "#35312B" },
  blue: { background: "#1B283A", border: "#2D4363" },
  teal: { background: "#182C2A", border: "#294B47" },
  green: { background: "#1C2B1F", border: "#304A36" },
  yellow: { background: "#2E2817", border: "#4F4425" },
  orange: { background: "#312319", border: "#543B29" },
  pink: { background: "#301E26", border: "#523240" },
  purple: { background: "#262036", border: "#41375C" },
};

const LIGHT_THEME: NoteThemePalette = {
  ink: "#1F2128",
  muted: "#60594F",
  border: "#E1DACD",
  quoteBar: "#C8C1B4",
  accent: "#3252B6",
  tint: "#E9EEF9",
  codeBg: "#F7F4ED",
  warning: "#8E5B12",
  warningBg: "#FBF3E4",
  danger: "#B33C3C",
  dangerBg: "#FBECEB",
};

const DARK_THEME: NoteThemePalette = {
  ink: "#EBE6DD",
  muted: "#A19A8E",
  border: "#35312B",
  quoteBar: "#524C43",
  accent: "#8CAAF9",
  tint: "#252F49",
  codeBg: "#171513",
  warning: "#EAB665",
  warningBg: "#31281B",
  danger: "#F28E88",
  dangerBg: "#332020",
};

export function noteCardSurfaceColors(color: NoteCardColor | undefined, dark: boolean): CardPalette {
  const palette = dark ? DARK_CARD_COLORS : LIGHT_CARD_COLORS;
  return palette[color ?? "default"] ?? palette.default;
}

type LayoutState = {
  y: number;
  maxY: number;
  parts: string[];
  hasContent: boolean;
  theme: NoteThemePalette;
  noteDocuments?: Readonly<Record<string, NoteDocument>>;
};

function emitWrappedText(
  state: LayoutState,
  options: {
    text: string;
    x: number;
    availWidth: number;
    fontSize: number;
    lineHeight: number;
    fontWeight?: number;
    fill: string;
    fontFamily?: string;
    prefix?: string;
    prefixFill?: string;
    strikeThrough?: boolean;
    monospace?: boolean;
  },
) {
  const {
    text,
    x,
    availWidth,
    fontSize,
    lineHeight,
    fontWeight = 400,
    fill,
    fontFamily = NOTE_SVG_FONT_SANS,
    prefix,
    prefixFill,
    strikeThrough = false,
    monospace = false,
  } = options;
  const prefixWidth = prefix ? Math.max(14, estimateTextWidth(prefix, fontSize, false) + 2) : 0;
  const bodyWidth = Math.max(20, availWidth - prefixWidth);
  const lines = wrapText(text, bodyWidth, fontSize, monospace);
  const weightAttr = fontWeight !== 400 ? ` font-weight="${fontWeight}"` : "";
  const strikeAttr = strikeThrough ? ' text-decoration="line-through"' : "";
  const spaceAttr = monospace ? ' xml:space="preserve"' : "";

  for (const [lineIndex, line] of lines.entries()) {
    if (state.y > state.maxY + lineHeight) break;
    const baseline = state.y + fontSize;
    if (prefix && lineIndex === 0) {
      const prefixColor = prefixFill ?? fill;
      state.parts.push(
        `<text x="${x}" y="${baseline}" fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}"${weightAttr}>`
        + `<tspan fill="${prefixColor}">${escapeXml(prefix)}</tspan>`
        + `<tspan x="${x + prefixWidth}"${strikeAttr}>${escapeXml(line)}</tspan>`
        + `</text>`,
      );
    } else {
      const lineX = prefix ? x + prefixWidth : x;
      state.parts.push(
        `<text x="${lineX}" y="${baseline}" fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}"${weightAttr}${spaceAttr}>`
        + `<tspan${strikeAttr}>${escapeXml(line)}</tspan>`
        + `</text>`,
      );
    }
    state.y += lineHeight;
    state.hasContent = true;
  }
}

function calloutColors(tone: unknown, theme: NoteThemePalette): { bg: string; accent: string } {
  if (tone === "warning") return { bg: theme.warningBg, accent: theme.warning };
  if (tone === "danger") return { bg: theme.dangerBg, accent: theme.danger };
  return { bg: theme.tint, accent: theme.accent };
}

const collapsed = (token: Token) => blockText(token).replace(/\s+/g, " ").trim();

function renderListItem(
  state: LayoutState,
  item: Tokens.ListItem,
  prefix: string,
  prefixFill: string,
  indent: number,
  availWidth: number,
  textFill: string,
  strikeThrough: boolean,
) {
  const children = item.tokens as NoteToken[];
  if (!children.length) {
    emitWrappedText(state, {
      text: "",
      x: indent,
      availWidth,
      fontSize: 13.5,
      lineHeight: 19,
      fill: textFill,
      prefix,
      prefixFill,
      strikeThrough,
    });
    return;
  }
  const [first, ...rest] = children;
  emitWrappedText(state, {
    text: first.type === "text" || first.type === "paragraph" ? inlineText(first.tokens).trim() : collapsed(first),
    x: indent,
    availWidth,
    fontSize: 13.5,
    lineHeight: 19,
    fill: textFill,
    prefix,
    prefixFill,
    strikeThrough,
  });
  if (rest.length) {
    renderBlocks(state, rest, indent + 16, Math.max(24, availWidth - 16), textFill);
  }
}

function boxedLine(state: LayoutState, indent: number, availWidth: number, text: string, options: { fontWeight?: number; fill: string; padX: number }) {
  if (state.hasContent) state.y += 3;
  const insertIndex = state.parts.length;
  const boxTop = state.y;
  state.y += 6;
  emitWrappedText(state, {
    text,
    x: indent + options.padX,
    availWidth: Math.max(24, availWidth - options.padX * 2),
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: options.fontWeight,
    fill: options.fill,
  });
  const boxHeight = Math.max(26, state.y - boxTop + 5);
  state.parts.splice(
    insertIndex,
    0,
    `<rect x="${indent}" y="${boxTop}" width="${availWidth}" height="${boxHeight}" rx="5" fill="${state.theme.codeBg}" stroke="${state.theme.border}" stroke-width="1" />`,
  );
  state.y = boxTop + boxHeight + 6;
}

/** A paragraph that is only an image or a reference link stands for an image, embed or block reference. */
function renderStandaloneInline(state: LayoutState, token: NoteToken, indent: number, availWidth: number): boolean {
  const only = token.tokens?.length === 1 ? token.tokens[0] : null;
  if (only?.type === "image") {
    const image = only as Tokens.Image;
    const route = parseNoteRoute(image.href);
    if (route) {
      const referenced = state.noteDocuments?.[route.noteId];
      const label = (referenced ? noteFirstLine(referenced) : "") || image.text.trim() || "Embedded Note";
      boxedLine(state, indent, availWidth, `[Note: ${label}]`, { fontWeight: 600, fill: state.theme.ink, padX: 8 });
      return true;
    }
    if (isNoteAssetSrc(image.href)) {
      const alt = image.text.replace(/\s+/g, " ").trim();
      boxedLine(state, indent, availWidth, alt ? `[Image: ${alt}]` : "[Image]", { fill: state.theme.muted, padX: 8 });
      return true;
    }
    return false;
  }
  if (only?.type === "link") {
    const route = parseNoteRoute((only as Tokens.Link).href);
    if (!route?.blockId) return false;
    if (state.hasContent) state.y += 3;
    const preview = findBlockPreview(state.noteDocuments?.[route.noteId], route.blockId);
    const insertIndex = state.parts.length;
    const boxTop = state.y;
    state.y += 5;
    emitWrappedText(state, {
      text: preview ?? "[Block reference]",
      x: indent + 12,
      availWidth: Math.max(24, availWidth - 18),
      fontSize: 12.5,
      lineHeight: 18,
      fill: preview ? state.theme.ink : state.theme.muted,
    });
    const boxHeight = Math.max(24, state.y - boxTop + 4);
    state.parts.splice(
      insertIndex,
      0,
      `<rect x="${indent}" y="${boxTop}" width="${availWidth}" height="${boxHeight}" rx="4" fill="${state.theme.tint}" />`
      + `<rect x="${indent}" y="${boxTop}" width="3" height="${boxHeight}" rx="1.5" fill="${state.theme.accent}" />`,
    );
    state.y = boxTop + boxHeight + 5;
    return true;
  }
  return false;
}

function renderBlock(
  state: LayoutState,
  node: NoteToken,
  indent: number,
  availWidth: number,
  inheritedFill?: string,
) {
  if (state.y > state.maxY + 24) return;
  const fill = inheritedFill ?? state.theme.ink;

  switch (node.type) {
    case "heading": {
      const level = node.depth;
      const fontSize = level <= 1 ? 18 : level === 2 ? 16 : 14.5;
      const lineHeight = level <= 1 ? 23 : level === 2 ? 21 : 19;
      const text = inlineText(node.tokens).trim();
      if (!text) return;
      if (state.hasContent) state.y += 6;
      emitWrappedText(state, { text, x: indent, availWidth, fontSize, lineHeight, fontWeight: 600, fill });
      state.y += 4;
      return;
    }

    case "paragraph":
    case "text": {
      if (renderStandaloneInline(state, node, indent, availWidth)) return;
      const text = inlineText(node.tokens);
      if (!text.trim()) {
        if (state.hasContent) state.y += 6;
        return;
      }
      emitWrappedText(state, { text, x: indent, availWidth, fontSize: 13.5, lineHeight: 19.5, fill });
      state.y += 5;
      return;
    }

    case "list": {
      const list = node as Tokens.List;
      const start = typeof list.start === "number" && Number.isFinite(list.start) ? Math.floor(list.start) : 1;
      for (const [index, item] of list.items.entries()) {
        if (state.y > state.maxY + 24) break;
        if (item.task) {
          const checked = Boolean(item.checked);
          renderListItem(state, item, checked ? "☑ " : "☐ ", checked ? state.theme.accent : state.theme.muted, indent, availWidth, checked ? state.theme.muted : fill, checked);
        } else {
          renderListItem(state, item, list.ordered ? `${start + index}. ` : "• ", state.theme.muted, indent, availWidth, fill, false);
        }
        state.y += 2;
      }
      state.y += 3;
      return;
    }

    case "blockquote": {
      if (state.hasContent) state.y += 3;
      const insertIndex = state.parts.length;
      const startY = state.y;
      renderBlocks(state, node.tokens as NoteToken[], indent + 12, Math.max(24, availWidth - 12), state.theme.muted);
      const barHeight = Math.max(16, state.y - startY - 4);
      state.parts.splice(
        insertIndex,
        0,
        `<rect x="${indent}" y="${startY}" width="3" height="${barHeight}" rx="1.5" fill="${state.theme.quoteBar}" />`,
      );
      state.y += 4;
      return;
    }

    case "callout": {
      if (state.hasContent) state.y += 4;
      const colors = calloutColors(node.tone, state.theme);
      const insertIndex = state.parts.length;
      const boxTop = state.y;
      state.y += 8;
      renderBlocks(state, node.tokens as NoteToken[], indent + 14, Math.max(24, availWidth - 22), state.theme.ink);
      const boxBottom = Math.max(boxTop + 28, state.y + 3);
      const boxHeight = boxBottom - boxTop;
      state.parts.splice(
        insertIndex,
        0,
        `<rect x="${indent}" y="${boxTop}" width="${availWidth}" height="${boxHeight}" rx="6" fill="${colors.bg}" />`
        + `<rect x="${indent}" y="${boxTop}" width="3" height="${boxHeight}" rx="1.5" fill="${colors.accent}" />`,
      );
      state.y = boxBottom + 6;
      state.hasContent = true;
      return;
    }

    case "details": {
      const open = node.open !== false;
      emitWrappedText(state, {
        text: String(node.summary).replace(/\s+/g, " ").trim() || "Toggle",
        x: indent,
        availWidth,
        fontSize: 13.5,
        lineHeight: 19.5,
        fontWeight: 600,
        fill,
        prefix: open ? "▾ " : "▸ ",
        prefixFill: state.theme.muted,
      });
      if (open && node.tokens?.length) {
        state.y += 2;
        renderBlocks(state, node.tokens as NoteToken[], indent + 16, Math.max(24, availWidth - 16), inheritedFill);
      }
      state.y += 4;
      return;
    }

    case "code": {
      if (state.hasContent) state.y += 4;
      const rawCode = String(node.text);
      const codeWidth = Math.max(24, availWidth - 16);
      const lines = wrapText(rawCode || " ", codeWidth, 11.5, true);
      const boxTop = state.y;
      const boxPadY = 7;
      const lineHeight = 16;
      const visibleLines = lines.slice(0, Math.max(1, Math.ceil((state.maxY - boxTop + 32) / lineHeight)));
      const boxHeight = boxPadY * 2 + Math.max(1, visibleLines.length) * lineHeight;
      state.parts.push(
        `<rect x="${indent}" y="${boxTop}" width="${availWidth}" height="${boxHeight}" rx="5" fill="${state.theme.codeBg}" stroke="${state.theme.border}" stroke-width="1" />`,
      );
      for (const [index, line] of visibleLines.entries()) {
        const baseline = boxTop + boxPadY + 11.5 + index * lineHeight;
        state.parts.push(
          `<text x="${indent + 8}" y="${baseline}" fill="${state.theme.ink}" font-family="${NOTE_SVG_FONT_MONO}" font-size="11.5" xml:space="preserve"><tspan>${escapeXml(line)}</tspan></text>`,
        );
      }
      state.y = boxTop + boxHeight + 6;
      state.hasContent = true;
      return;
    }

    case "table": {
      if (state.hasContent) state.y += 4;
      const table = node as Tokens.Table;
      const rows = [{ cells: table.header, isHeader: true }, ...table.rows.map((cells) => ({ cells, isHeader: false }))];
      for (const row of rows) {
        if (state.y > state.maxY + 24) break;
        const rowText = row.cells.map((cell) => inlineText(cell.tokens).replace(/\s+/g, " ").trim()).join(" | ");
        const insertIndex = state.parts.length;
        const rowTop = state.y;
        state.y += 3;
        emitWrappedText(state, {
          text: rowText || " ",
          x: indent + 6,
          availWidth: Math.max(24, availWidth - 12),
          fontSize: 12.5,
          lineHeight: 18,
          fontWeight: row.isHeader ? 600 : 400,
          fill,
        });
        const rowBottom = state.y + 3;
        if (row.isHeader) {
          state.parts.splice(
            insertIndex,
            0,
            `<rect x="${indent}" y="${rowTop}" width="${availWidth}" height="${rowBottom - rowTop}" rx="3" fill="${state.theme.codeBg}" />`,
          );
        }
        state.parts.push(`<rect x="${indent}" y="${rowBottom}" width="${availWidth}" height="1" fill="${state.theme.border}" />`);
        state.y = rowBottom + 1;
      }
      state.y += 6;
      return;
    }

    case "hr": {
      state.parts.push(`<rect x="${indent}" y="${state.y + 5}" width="${availWidth}" height="1" fill="${state.theme.border}" />`);
      state.y += 12;
      state.hasContent = true;
      return;
    }

    case "blockMath": {
      if (state.hasContent) state.y += 3;
      const latex = String(node.text).replace(/\s+/g, " ").trim();
      emitWrappedText(state, {
        text: latex || "[Math]",
        x: indent + 6,
        availWidth: Math.max(24, availWidth - 12),
        fontSize: 12.5,
        lineHeight: 18,
        fill,
        fontFamily: NOTE_SVG_FONT_MONO,
      });
      state.y += 5;
      return;
    }

    default: {
      const fallback = String(node.raw).replace(/\s+/g, " ").trim();
      if (fallback) {
        emitWrappedText(state, { text: fallback, x: indent, availWidth, fontSize: 13.5, lineHeight: 19.5, fill });
        state.y += 5;
      }
    }
  }
}

function renderBlocks(
  state: LayoutState,
  nodes: readonly NoteToken[],
  indent: number,
  availWidth: number,
  inheritedFill?: string,
) {
  for (const node of nodes) {
    if (state.y > state.maxY + 24) break;
    renderBlock(state, node, indent, availWidth, inheritedFill);
  }
}

export function renderNoteDocumentSvgBody(options: {
  doc: NoteDocument | undefined;
  compact: boolean;
  dark: boolean;
  cardY: number;
  height: number;
  contentX: number;
  contentWidth: number;
  paddingY: number;
  noteDocuments?: Readonly<Record<string, NoteDocument>>;
}): string {
  const { doc, compact, dark, cardY, height, contentX, contentWidth, paddingY, noteDocuments } = options;
  const theme = dark ? DARK_THEME : LIGHT_THEME;
  if (compact) {
    const firstLine = doc ? noteFirstLine(doc) : "";
    const label = firstLine || (doc ? "Empty note" : "Note");
    const labelFill = firstLine ? theme.ink : theme.muted;
    const truncated = truncateLine(label, contentWidth, 14);
    const baseline = cardY + Math.min(height / 2 + 5, 29);
    return `<text x="${contentX}" y="${baseline}" fill="${labelFill}" font-family="${NOTE_SVG_FONT_SANS}" font-size="14" font-weight="600"><tspan>${escapeXml(truncated)}</tspan></text>`;
  }
  if (!doc) {
    const baseline = cardY + paddingY + 13.5;
    return `<text x="${contentX}" y="${baseline}" fill="${theme.muted}" font-family="${NOTE_SVG_FONT_SANS}" font-size="13.5"><tspan>Note</tspan></text>`;
  }
  const state: LayoutState = {
    y: cardY + paddingY,
    maxY: cardY + height,
    parts: [],
    hasContent: false,
    theme,
    noteDocuments,
  };
  renderBlocks(state, noteBlocks(lexNote(doc)), contentX, contentWidth);
  if (!state.hasContent) {
    const baseline = cardY + paddingY + 13.5;
    state.parts.push(
      `<text x="${contentX}" y="${baseline}" fill="${theme.muted}" font-family="${NOTE_SVG_FONT_SANS}" font-size="13.5"><tspan>Empty note</tspan></text>`,
    );
  }
  return state.parts.join("");
}
