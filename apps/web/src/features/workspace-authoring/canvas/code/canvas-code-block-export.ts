import {
  codeThemeSurface,
  codeTokenColor,
  effectiveCanvasCodeLanguage,
  highlightCodeLines,
  readCanvasCodeBlock,
  resolveCodeTheme,
} from "./canvas-code-block.ts";
import {
  CODE_BLOCK_BODY_PADDING_X,
  CODE_BLOCK_BODY_PADDING_Y,
  CODE_BLOCK_FONT_SIZE,
  CODE_BLOCK_LINE_HEIGHT,
  CODE_BLOCK_LINE_NUMBER_WIDTH,
} from "./canvas-code-block-layout.ts";

export type CodeBlockExportViews = Readonly<Record<string, { wordWrap: boolean }>>;

const svgNamespace = "http://www.w3.org/2000/svg";

type CodeBlockSceneElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function wrapTokens(tokens: readonly { text: string; classes: string[] }[], maxCharacters: number) {
  const rows: { text: string; classes: string[] }[][] = [[]];
  let characterCount = 0;
  for (const token of tokens) {
    for (const character of Array.from(token.text)) {
      if (characterCount >= maxCharacters) {
        rows.push([]);
        characterCount = 0;
      }
      const row = rows[rows.length - 1];
      const previous = row[row.length - 1];
      if (previous && previous.classes.join(" ") === token.classes.join(" ")) previous.text += character;
      else row.push({ text: character, classes: token.classes });
      characterCount += character === "\t" ? 2 : 1;
    }
  }
  return rows;
}

function renderTokenSpans(tokens: readonly { text: string; classes: string[] }[], theme: "light" | "dark") {
  return tokens.map((token) => (
    `<tspan fill="${codeTokenColor(token.classes, theme)}">${escapeXml(token.text)}</tspan>`
  )).join("");
}

function renderCodeBlock(element: CodeBlockSceneElement, index: number, appDark: boolean, wordWrap: boolean) {
  const block = readCanvasCodeBlock(element);
  if (
    !block
    || element.isDeleted
    || ![element.x, element.y, element.width, element.height, element.angle].every(Number.isFinite)
    || element.width <= 0
    || element.height <= 0
  ) return "";

  const theme = resolveCodeTheme(block.theme, appDark);
  const surface = codeThemeSurface(theme);
  const clipId = `notespace-code-export-clip-${index}`;
  const bodyClipId = `${clipId}-body`;
  const rotation = element.angle * 180 / Math.PI;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const gutterWidth = block.lineNumbers ? CODE_BLOCK_LINE_NUMBER_WIDTH : 0;
  const bodyTop = element.y + 1;
  const bodyHeight = Math.max(0, element.height - 2);
  const contentWidth = Math.max(
    1,
    element.width - 2 - CODE_BLOCK_BODY_PADDING_X * 2 - gutterWidth,
  );
  const maxCharacters = Math.max(1, Math.floor(contentWidth / (CODE_BLOCK_FONT_SIZE * 0.6)));
  const left = element.x + 1 + CODE_BLOCK_BODY_PADDING_X + gutterWidth;
  const firstBaseline = bodyTop + CODE_BLOCK_BODY_PADDING_Y + CODE_BLOCK_FONT_SIZE + 2;
  let visualRow = 0;
  let lines = "";

  const language = effectiveCanvasCodeLanguage(block);
  for (const [lineIndex, tokens] of highlightCodeLines(block.code, language).entries()) {
    const rows = wordWrap ? wrapTokens(tokens, maxCharacters) : [tokens];
    for (const [rowIndex, row] of rows.entries()) {
      const baseline = firstBaseline + visualRow * CODE_BLOCK_LINE_HEIGHT;
      if (block.lineNumbers && rowIndex === 0) {
        lines += `<text x="${element.x + 1 + CODE_BLOCK_LINE_NUMBER_WIDTH - 6}" y="${baseline}" text-anchor="end" fill="${surface.muted}" font-family="JetBrains Mono, Cascadia Code, SFMono-Regular, Consolas, monospace" font-size="${CODE_BLOCK_FONT_SIZE}" xml:space="preserve">${lineIndex + 1}</text>`;
      }
      lines += `<text x="${left}" y="${baseline}" fill="${surface.foreground}" font-family="JetBrains Mono, Cascadia Code, SFMono-Regular, Consolas, monospace" font-size="${CODE_BLOCK_FONT_SIZE}" xml:space="preserve">${renderTokenSpans(row, theme)}</text>`;
      visualRow += 1;
    }
  }

  return `<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect x="${element.x + 1}" y="${element.y + 1}" width="${Math.max(0, element.width - 2)}" height="${Math.max(0, element.height - 2)}" rx="5" /></clipPath><clipPath id="${bodyClipId}" clipPathUnits="userSpaceOnUse"><rect x="${element.x + 1}" y="${bodyTop}" width="${Math.max(0, element.width - 2)}" height="${bodyHeight}" /></clipPath></defs><g transform="rotate(${rotation} ${centerX} ${centerY})"><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="6" fill="${surface.background}" stroke="${surface.border}" /><g clip-path="url(#${clipId})"><g clip-path="url(#${bodyClipId})">${lines}</g></g></g>`;
}

export function canvasCodeBlocksSvgMarkup(elements: readonly CodeBlockSceneElement[], appDark: boolean, views: CodeBlockExportViews = {}) {
  return elements.map((element, index) => renderCodeBlock(element, index, appDark, views[element.id]?.wordWrap ?? true)).join("");
}

export function appendCanvasCodeBlocksToSvg(
  svg: SVGSVGElement,
  elements: readonly CodeBlockSceneElement[],
  appDark: boolean,
  views: CodeBlockExportViews = {},
) {
  const markup = canvasCodeBlocksSvgMarkup(elements, appDark, views);
  if (!markup) return;
  const parsed = new DOMParser().parseFromString(`<svg xmlns="${svgNamespace}">${markup}</svg>`, "image/svg+xml");
  for (const child of Array.from(parsed.documentElement.children)) {
    svg.append(document.importNode(child, true));
  }
}
