import {
  noteFirstLine,
  readCanvasNoteReference,
  type NoteCardColor,
  type NoteDocument,
  type NoteNode,
} from "../../../../domain/note/note.ts";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CARD_PADDING_X = 14;
const CARD_PADDING_Y = 12;
const CARD_RADIUS = 8;
const FONT_SANS = "Open Sans, system-ui, -apple-system, sans-serif";
const FONT_MONO = "JetBrains Mono, Cascadia Code, SFMono-Regular, Consolas, monospace";

export type NoteSceneElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity?: number;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
};

export type NoteExportOffset = {
  x: number;
  y: number;
};

type CardPalette = {
  background: string;
  border: string;
};

type NoteThemePalette = {
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

/** Heptabase-style warm tints. A colored card is the same light surface in both themes, so it keeps dark ink. */
const TINTED_CARD_COLORS: Record<Exclude<NoteCardColor, "default">, CardPalette> = {
  blue: { background: "#B8D9F0", border: "#8FBFE3" },
  teal: { background: "#B7E3DD", border: "#86C9C0" },
  green: { background: "#CBE5C3", border: "#9FCB94" },
  yellow: { background: "#F7E3A1", border: "#E2C463" },
  orange: { background: "#F8D0B0", border: "#E7A877" },
  pink: { background: "#F6CFD6", border: "#E3A1AE" },
  purple: { background: "#DCD0F4", border: "#B7A3E6" },
};

const LIGHT_CARD_COLORS: Record<NoteCardColor, CardPalette> = {
  default: { background: "#FFFFFF", border: "#E3E3DD" },
  ...TINTED_CARD_COLORS,
};

const DARK_CARD_COLORS: Record<NoteCardColor, CardPalette> = {
  default: { background: "#1D1E23", border: "#34353E" },
  ...TINTED_CARD_COLORS,
};

const LIGHT_THEME: NoteThemePalette = {
  ink: "#14151A",
  muted: "#5C6270",
  border: "#E3E3DD",
  quoteBar: "#C8CBD6",
  accent: "#2858D8",
  tint: "#EEF3FF",
  codeBg: "#FAFAF8",
  warning: "#98651A",
  warningBg: "#FBF4E6",
  danger: "#B13E4B",
  dangerBg: "#FBECEF",
};

const DARK_THEME: NoteThemePalette = {
  ink: "#E8E8EF",
  muted: "#9FA2B0",
  border: "#34353E",
  quoteBar: "#4B4D5A",
  accent: "#91B1FF",
  tint: "#22304C",
  codeBg: "#18191E",
  warning: "#F3BC6A",
  warningBg: "#31281B",
  danger: "#FF9AA5",
  dangerBg: "#332025",
};

export function noteCardSurfaceColors(color: NoteCardColor | undefined, dark: boolean): CardPalette {
  const palette = dark ? DARK_CARD_COLORS : LIGHT_CARD_COLORS;
  return palette[color ?? "default"] ?? palette.default;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function estimateCharWidth(character: string, fontSize: number, monospace: boolean): number {
  if (monospace) return character === "\t" ? fontSize * 1.2 : fontSize * 0.6;
  const code = character.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return fontSize * 0.96;
  if ("iIl1.,;:'!|()[] ".includes(character)) return fontSize * 0.34;
  if ("mwMW@%".includes(character)) return fontSize * 0.78;
  return fontSize * 0.56;
}

function estimateTextWidth(text: string, fontSize: number, monospace: boolean): number {
  let width = 0;
  for (const character of Array.from(text)) {
    width += estimateCharWidth(character, fontSize, monospace);
  }
  return width;
}

function breakLongWord(word: string, maxWidthPx: number, fontSize: number, monospace: boolean): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const character of Array.from(word)) {
    const charWidth = estimateCharWidth(character, fontSize, monospace);
    if (current && currentWidth + charWidth > maxWidthPx) {
      chunks.push(current);
      current = character;
      currentWidth = charWidth;
    } else {
      current += character;
      currentWidth += charWidth;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

function wrapText(text: string, maxWidthPx: number, fontSize: number, monospace = false): string[] {
  const safeMaxWidth = Math.max(fontSize, maxWidthPx);
  const rawLines = text.split(/\r?\n/);
  const result: string[] = [];

  for (const rawLine of rawLines) {
    if (!rawLine) {
      result.push("");
      continue;
    }
    if (monospace) {
      result.push(...breakLongWord(rawLine, safeMaxWidth, fontSize, true));
      continue;
    }
    const normalized = rawLine.replace(/\s+/g, " ").trim();
    if (!normalized) {
      result.push("");
      continue;
    }
    const words = normalized.split(" ");
    let current = "";
    let currentWidth = 0;
    const spaceWidth = estimateCharWidth(" ", fontSize, false);
    for (const word of words) {
      const wordWidth = estimateTextWidth(word, fontSize, false);
      if (!current) {
        if (wordWidth <= safeMaxWidth) {
          current = word;
          currentWidth = wordWidth;
        } else {
          const chunks = breakLongWord(word, safeMaxWidth, fontSize, false);
          result.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] ?? "";
          currentWidth = estimateTextWidth(current, fontSize, false);
        }
        continue;
      }
      if (currentWidth + spaceWidth + wordWidth <= safeMaxWidth) {
        current = `${current} ${word}`;
        currentWidth += spaceWidth + wordWidth;
      } else {
        result.push(current);
        if (wordWidth <= safeMaxWidth) {
          current = word;
          currentWidth = wordWidth;
        } else {
          const chunks = breakLongWord(word, safeMaxWidth, fontSize, false);
          result.push(...chunks.slice(0, -1));
          current = chunks[chunks.length - 1] ?? "";
          currentWidth = estimateTextWidth(current, fontSize, false);
        }
      }
    }
    if (current) result.push(current);
  }

  return result;
}

function truncateLine(text: string, maxWidthPx: number, fontSize: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (estimateTextWidth(normalized, fontSize, false) <= maxWidthPx) return normalized;
  const ellipsisWidth = fontSize * 0.72;
  const budget = Math.max(fontSize, maxWidthPx - ellipsisWidth);
  let output = "";
  let width = 0;
  for (const character of Array.from(normalized)) {
    const charWidth = estimateCharWidth(character, fontSize, false);
    if (output && width + charWidth > budget) break;
    output += character;
    width += charWidth;
  }
  return `${output.trimEnd()}…`;
}

function extractInlineText(node: NoteNode): string {
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "inlineMath") {
    return typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
  }
  if (!node.content?.length) return "";
  return node.content.map(extractInlineText).join("");
}

function extractCollapsedText(node: NoteNode): string {
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "hardBreak") return " ";
  if (node.type === "inlineMath" || node.type === "blockMath") {
    return typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
  }
  if (!node.content?.length) return "";
  return node.content.map(extractCollapsedText).join(" ").replace(/\s+/g, " ").trim();
}

function findBlockPreview(document: NoteDocument | undefined, blockId: string): string | null {
  if (!document || !blockId) return null;
  const visit = (nodes: readonly NoteNode[]): string | null => {
    for (const node of nodes) {
      if (node.attrs?.blockId === blockId) {
        const preview = extractCollapsedText(node);
        return preview || null;
      }
      if (node.content?.length) {
        const nested = visit(node.content);
        if (nested) return nested;
      }
    }
    return null;
  };
  return visit(document.content);
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
    fontFamily = FONT_SANS,
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

function renderListItem(
  state: LayoutState,
  item: NoteNode,
  prefix: string,
  prefixFill: string,
  indent: number,
  availWidth: number,
  textFill: string,
  strikeThrough: boolean,
) {
  const children = item.content ?? [];
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
  if (first.type === "paragraph") {
    const lineText = extractInlineText(first).trim();
    emitWrappedText(state, {
      text: lineText,
      x: indent,
      availWidth,
      fontSize: 13.5,
      lineHeight: 19,
      fill: textFill,
      prefix,
      prefixFill,
      strikeThrough,
    });
  } else {
    emitWrappedText(state, {
      text: extractCollapsedText(first),
      x: indent,
      availWidth,
      fontSize: 13.5,
      lineHeight: 19,
      fill: textFill,
      prefix,
      prefixFill,
      strikeThrough,
    });
  }
  if (rest.length) {
    const nestedIndent = indent + 16;
    const nestedWidth = Math.max(24, availWidth - 16);
    renderBlocks(state, rest, nestedIndent, nestedWidth, textFill);
  }
}

function renderBlock(
  state: LayoutState,
  node: NoteNode,
  indent: number,
  availWidth: number,
  inheritedFill?: string,
) {
  if (state.y > state.maxY + 24) return;
  const fill = inheritedFill ?? state.theme.ink;

  switch (node.type) {
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const fontSize = level <= 1 ? 18 : level === 2 ? 16 : 14.5;
      const lineHeight = level <= 1 ? 23 : level === 2 ? 21 : 19;
      const text = extractInlineText(node).trim();
      if (!text) return;
      if (state.hasContent) state.y += 6;
      emitWrappedText(state, { text, x: indent, availWidth, fontSize, lineHeight, fontWeight: 600, fill });
      state.y += 4;
      return;
    }

    case "paragraph": {
      const text = extractInlineText(node);
      if (!text.trim()) {
        if (state.hasContent) state.y += 6;
        return;
      }
      emitWrappedText(state, { text, x: indent, availWidth, fontSize: 13.5, lineHeight: 19.5, fill });
      state.y += 5;
      return;
    }

    case "bulletList": {
      for (const item of node.content ?? []) {
        if (state.y > state.maxY + 24) break;
        renderListItem(state, item, "• ", state.theme.muted, indent, availWidth, fill, false);
        state.y += 2;
      }
      state.y += 3;
      return;
    }

    case "orderedList": {
      const start = typeof node.attrs?.start === "number" && Number.isFinite(node.attrs.start)
        ? Math.floor(node.attrs.start)
        : 1;
      for (const [index, item] of (node.content ?? []).entries()) {
        if (state.y > state.maxY + 24) break;
        renderListItem(state, item, `${start + index}. `, state.theme.muted, indent, availWidth, fill, false);
        state.y += 2;
      }
      state.y += 3;
      return;
    }

    case "taskList": {
      for (const item of node.content ?? []) {
        if (state.y > state.maxY + 24) break;
        const checked = item.attrs?.checked === true;
        const prefix = checked ? "☑ " : "☐ ";
        const prefixFill = checked ? state.theme.accent : state.theme.muted;
        const itemFill = checked ? state.theme.muted : fill;
        renderListItem(state, item, prefix, prefixFill, indent, availWidth, itemFill, checked);
        state.y += 2;
      }
      state.y += 3;
      return;
    }

    case "blockquote": {
      if (state.hasContent) state.y += 3;
      const insertIndex = state.parts.length;
      const startY = state.y;
      renderBlocks(state, node.content ?? [], indent + 12, Math.max(24, availWidth - 12), state.theme.muted);
      const barHeight = Math.max(16, state.y - startY - 4);
      state.parts.splice(
        insertIndex,
        0,
        `<rect x="${indent}" y="${startY}" width="3" height="${barHeight}" rx="1.5" fill="${state.theme.quoteBar}" />`,
      );
      state.y += 4;
      return;
    }

    case "noteCallout": {
      if (state.hasContent) state.y += 4;
      const colors = calloutColors(node.attrs?.tone, state.theme);
      const insertIndex = state.parts.length;
      const boxTop = state.y;
      state.y += 8;
      renderBlocks(state, node.content ?? [], indent + 14, Math.max(24, availWidth - 22), state.theme.ink);
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

    case "noteToggle": {
      const open = node.attrs?.open !== false;
      const children = node.content ?? [];
      const summaryNode = children.find((child) => child.type === "noteToggleSummary");
      const bodyNodes = children.filter((child) => child !== summaryNode);
      const summaryText = summaryNode ? extractInlineText(summaryNode).replace(/\s+/g, " ").trim() : "";
      emitWrappedText(state, {
        text: summaryText || "Toggle",
        x: indent,
        availWidth,
        fontSize: 13.5,
        lineHeight: 19.5,
        fontWeight: 600,
        fill,
        prefix: open ? "▾ " : "▸ ",
        prefixFill: state.theme.muted,
      });
      if (open && bodyNodes.length) {
        state.y += 2;
        renderBlocks(state, bodyNodes, indent + 16, Math.max(24, availWidth - 16), inheritedFill);
      }
      state.y += 4;
      return;
    }

    case "codeBlock": {
      if (state.hasContent) state.y += 4;
      const rawCode = extractInlineText(node);
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
          `<text x="${indent + 8}" y="${baseline}" fill="${state.theme.ink}" font-family="${FONT_MONO}" font-size="11.5" xml:space="preserve"><tspan>${escapeXml(line)}</tspan></text>`,
        );
      }
      state.y = boxTop + boxHeight + 6;
      state.hasContent = true;
      return;
    }

    case "table": {
      if (state.hasContent) state.y += 4;
      for (const row of node.content ?? []) {
        if (state.y > state.maxY + 24) break;
        const cells = row.content ?? [];
        const isHeader = cells.some((cell) => cell.type === "tableHeader");
        const rowText = cells.map((cell) => extractCollapsedText(cell)).join(" | ");
        const insertIndex = state.parts.length;
        const rowTop = state.y;
        state.y += 3;
        emitWrappedText(state, {
          text: rowText || " ",
          x: indent + 6,
          availWidth: Math.max(24, availWidth - 12),
          fontSize: 12.5,
          lineHeight: 18,
          fontWeight: isHeader ? 600 : 400,
          fill,
        });
        const rowBottom = state.y + 3;
        if (isHeader) {
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

    case "horizontalRule": {
      state.parts.push(`<rect x="${indent}" y="${state.y + 5}" width="${availWidth}" height="1" fill="${state.theme.border}" />`);
      state.y += 12;
      state.hasContent = true;
      return;
    }

    case "noteImage": {
      if (state.hasContent) state.y += 3;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.replace(/\s+/g, " ").trim() : "";
      const placeholder = alt ? `[Image: ${alt}]` : "[Image]";
      const insertIndex = state.parts.length;
      const boxTop = state.y;
      state.y += 6;
      emitWrappedText(state, {
        text: placeholder,
        x: indent + 8,
        availWidth: Math.max(24, availWidth - 16),
        fontSize: 12,
        lineHeight: 17,
        fill: state.theme.muted,
      });
      const boxHeight = Math.max(26, state.y - boxTop + 5);
      state.parts.splice(
        insertIndex,
        0,
        `<rect x="${indent}" y="${boxTop}" width="${availWidth}" height="${boxHeight}" rx="5" fill="${state.theme.codeBg}" stroke="${state.theme.border}" stroke-width="1" />`,
      );
      state.y = boxTop + boxHeight + 6;
      return;
    }

    case "blockMath": {
      if (state.hasContent) state.y += 3;
      const latex = typeof node.attrs?.latex === "string" ? node.attrs.latex.replace(/\s+/g, " ").trim() : "";
      emitWrappedText(state, {
        text: latex || "[Math]",
        x: indent + 6,
        availWidth: Math.max(24, availWidth - 12),
        fontSize: 12.5,
        lineHeight: 18,
        fill,
        fontFamily: FONT_MONO,
      });
      state.y += 5;
      return;
    }

    case "noteEmbed": {
      if (state.hasContent) state.y += 3;
      const refId = typeof node.attrs?.noteId === "string" ? node.attrs.noteId : "";
      const referenced = refId ? state.noteDocuments?.[refId] : undefined;
      const liveTitle = referenced ? noteFirstLine(referenced) : "";
      const attrLabel = typeof node.attrs?.label === "string" ? node.attrs.label.trim() : "";
      const label = liveTitle || attrLabel || "Embedded Note";
      const insertIndex = state.parts.length;
      const boxTop = state.y;
      state.y += 6;
      emitWrappedText(state, {
        text: `[Note: ${label}]`,
        x: indent + 8,
        availWidth: Math.max(24, availWidth - 16),
        fontSize: 12.5,
        lineHeight: 18,
        fontWeight: 600,
        fill: state.theme.ink,
      });
      const boxHeight = Math.max(26, state.y - boxTop + 5);
      state.parts.splice(
        insertIndex,
        0,
        `<rect x="${indent}" y="${boxTop}" width="${availWidth}" height="${boxHeight}" rx="5" fill="${state.theme.codeBg}" stroke="${state.theme.border}" stroke-width="1" />`,
      );
      state.y = boxTop + boxHeight + 6;
      return;
    }

    case "noteBlockReference": {
      if (state.hasContent) state.y += 3;
      const refId = typeof node.attrs?.noteId === "string" ? node.attrs.noteId : "";
      const blockId = typeof node.attrs?.blockId === "string" ? node.attrs.blockId : "";
      const preview = findBlockPreview(refId ? state.noteDocuments?.[refId] : undefined, blockId);
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
      return;
    }

    default: {
      const fallback = extractCollapsedText(node);
      if (fallback) {
        emitWrappedText(state, { text: fallback, x: indent, availWidth, fontSize: 13.5, lineHeight: 19.5, fill });
        state.y += 5;
      }
    }
  }
}

function renderBlocks(
  state: LayoutState,
  nodes: readonly NoteNode[],
  indent: number,
  availWidth: number,
  inheritedFill?: string,
) {
  for (const node of nodes) {
    if (state.y > state.maxY + 24) break;
    renderBlock(state, node, indent, availWidth, inheritedFill);
  }
}

function renderNoteCard(
  element: NoteSceneElement,
  index: number,
  dark: boolean,
  noteDocuments: Readonly<Record<string, NoteDocument>> | undefined,
  offset: NoteExportOffset,
): string {
  const reference = readCanvasNoteReference(element);
  if (
    !reference
    || element.isDeleted
    || ![element.x, element.y, element.width, element.height, element.angle].every(Number.isFinite)
    || element.width <= 0
    || element.height <= 0
  ) {
    return "";
  }

  const cardX = element.x + offset.x;
  const cardY = element.y + offset.y;
  const { width, height } = element;
  const rotation = element.angle * 180 / Math.PI;
  const centerX = cardX + width / 2;
  const centerY = cardY + height / 2;
  const opacityAttr = typeof element.opacity === "number" && Number.isFinite(element.opacity) && element.opacity < 100
    ? ` opacity="${Math.max(0, Math.min(100, element.opacity)) / 100}"`
    : "";

  const coloredCard = reference.color !== undefined && reference.color !== "default";
  const theme = dark && !coloredCard ? DARK_THEME : LIGHT_THEME;
  const surface = noteCardSurfaceColors(reference.color, dark);
  const cardRadius = reference.shape === "square" ? 0 : CARD_RADIUS;
  const clipId = `notespace-note-export-clip-${index}`;
  const bodyClipId = `${clipId}-body`;
  const contentWidth = Math.max(24, width - CARD_PADDING_X * 2);
  const contentX = cardX + CARD_PADDING_X;
  const doc = noteDocuments?.[reference.noteId];

  let bodyMarkup = "";
  if (reference.compact === true) {
    const firstLine = doc ? noteFirstLine(doc) : "";
    const label = firstLine || (doc ? "Empty note" : "Note");
    const labelFill = firstLine ? theme.ink : theme.muted;
    const truncated = truncateLine(label, contentWidth, 14);
    const baseline = cardY + Math.min(height / 2 + 5, 29);
    bodyMarkup = `<text x="${contentX}" y="${baseline}" fill="${labelFill}" font-family="${FONT_SANS}" font-size="14" font-weight="600"><tspan>${escapeXml(truncated)}</tspan></text>`;
  } else if (!doc) {
    const baseline = cardY + CARD_PADDING_Y + 13.5;
    bodyMarkup = `<text x="${contentX}" y="${baseline}" fill="${theme.muted}" font-family="${FONT_SANS}" font-size="13.5"><tspan>Note</tspan></text>`;
  } else {
    const state: LayoutState = {
      y: cardY + CARD_PADDING_Y,
      maxY: cardY + height,
      parts: [],
      hasContent: false,
      theme,
      noteDocuments,
    };
    renderBlocks(state, doc.content, contentX, contentWidth);
    if (!state.hasContent) {
      const baseline = cardY + CARD_PADDING_Y + 13.5;
      state.parts.push(
        `<text x="${contentX}" y="${baseline}" fill="${theme.muted}" font-family="${FONT_SANS}" font-size="13.5"><tspan>Empty note</tspan></text>`,
      );
    }
    bodyMarkup = state.parts.join("");
  }

  return `<defs>`
    + `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${cardX + 1}" y="${cardY + 1}" width="${Math.max(0, width - 2)}" height="${Math.max(0, height - 2)}" rx="${Math.max(0, cardRadius - 1)}" /></clipPath>`
    + `<clipPath id="${bodyClipId}" clipPathUnits="userSpaceOnUse"><rect x="${cardX + 1}" y="${cardY + 4}" width="${Math.max(0, width - 2)}" height="${Math.max(0, height - 8)}" /></clipPath>`
    + `</defs>`
    + `<g transform="rotate(${rotation} ${centerX} ${centerY})"${opacityAttr}>`
    + `<rect x="${cardX}" y="${cardY}" width="${width}" height="${height}" rx="${cardRadius}" fill="${surface.background}" stroke="${surface.border}" stroke-width="1" />`
    + `<g clip-path="url(#${clipId})"><g clip-path="url(#${bodyClipId})">${bodyMarkup}</g></g>`
    + `</g>`;
}

function rotatedBounds(element: NoteSceneElement): [number, number, number, number] {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const cos = Math.cos(element.angle || 0);
  const sin = Math.sin(element.angle || 0);
  const corners = [
    [element.x, element.y],
    [element.x + element.width, element.y],
    [element.x + element.width, element.y + element.height],
    [element.x, element.y + element.height],
  ] as const;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of corners) {
    const rx = cx + (px - cx) * cos - (py - cy) * sin;
    const ry = cy + (px - cx) * sin + (py - cy) * cos;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return [minX, minY, maxX, maxY];
}

function inferSvgOffset(svg: SVGSVGElement, elements: readonly NoteSceneElement[]): NoteExportOffset {
  const viewBoxAttr = svg.getAttribute("viewBox");
  if (!viewBoxAttr) return { x: 0, y: 0 };
  const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return { x: 0, y: 0 };
  const [vx, vy, vw, vh] = parts;
  if (vx !== 0 || vy !== 0 || vw <= 0 || vh <= 0) return { x: 0, y: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (![element.x, element.y, element.width, element.height].every(Number.isFinite)) continue;
    const [ex1, ey1, ex2, ey2] = rotatedBounds(element);
    if (ex1 < minX) minX = ex1;
    if (ey1 < minY) minY = ey1;
    if (ex2 > maxX) maxX = ex2;
    if (ey2 > maxY) maxY = ey2;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { x: 0, y: 0 };
  const paddingX = Math.max(0, (vw - (maxX - minX)) / 2);
  const paddingY = Math.max(0, (vh - (maxY - minY)) / 2);
  return { x: -minX + paddingX, y: -minY + paddingY };
}

export function canvasNotesSvgMarkup(
  elements: readonly NoteSceneElement[],
  dark: boolean,
  noteDocuments?: Readonly<Record<string, NoteDocument>>,
  offset: NoteExportOffset = { x: 0, y: 0 },
): string {
  const safeOffset = Number.isFinite(offset.x) && Number.isFinite(offset.y) ? offset : { x: 0, y: 0 };
  return elements
    .map((element, index) => renderNoteCard(element, index, dark, noteDocuments, safeOffset))
    .join("");
}

export function appendCanvasNotesToSvg(
  svg: SVGSVGElement,
  elements: readonly NoteSceneElement[],
  dark: boolean,
  noteDocuments?: Readonly<Record<string, NoteDocument>>,
  options?: { offset?: NoteExportOffset },
): void {
  const offset = options?.offset && Number.isFinite(options.offset.x) && Number.isFinite(options.offset.y)
    ? options.offset
    : inferSvgOffset(svg, elements);
  const markup = canvasNotesSvgMarkup(elements, dark, noteDocuments, offset);
  if (!markup) return;
  const parsed = new DOMParser().parseFromString(`<svg xmlns="${SVG_NAMESPACE}">${markup}</svg>`, "image/svg+xml");
  for (const child of Array.from(parsed.documentElement.children)) {
    svg.append(document.importNode(child, true));
  }
}
