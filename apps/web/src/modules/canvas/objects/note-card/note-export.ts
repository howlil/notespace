import { readCanvasNoteReference, type NoteDocument } from "../../../../entities/note.ts";
import {
  noteCardSurfaceColors,
  renderNoteDocumentSvgBody,
} from "../../../note-editor/export.ts";

export { noteCardSurfaceColors };

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CARD_PADDING_X = 14;
const CARD_PADDING_Y = 12;
const CARD_RADIUS = 8;

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

  const surface = noteCardSurfaceColors(reference.color, dark);
  const cardRadius = reference.shape === "square" ? 0 : CARD_RADIUS;
  const clipId = `notespace-note-export-clip-${index}`;
  const bodyClipId = `${clipId}-body`;
  const contentWidth = Math.max(24, width - CARD_PADDING_X * 2);
  const contentX = cardX + CARD_PADDING_X;

  const bodyMarkup = renderNoteDocumentSvgBody({
    doc: noteDocuments?.[reference.noteId],
    compact: reference.compact === true,
    dark,
    cardY,
    height,
    contentX,
    contentWidth,
    paddingY: CARD_PADDING_Y,
    noteDocuments,
  });

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
