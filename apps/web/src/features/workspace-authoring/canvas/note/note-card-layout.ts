type NoteCardViewport = { zoom: number; scrollX: number; scrollY: number };
type NoteCardGeometry = { x: number; y: number; width: number; height: number; angle?: number };

/** Below this zoom a card shows only its derived first line (B9a level of detail). */
export const NOTE_CARD_LABEL_ZOOM = 0.35;
export const NOTE_CARD_FOLDED_HEIGHT = 48;
export const NOTE_CARD_MIN_HEIGHT = 180;
export const NOTE_CARD_MAX_AUTO_HEIGHT = 560;
const NOTE_CARD_BODY_FONT_SIZE = 14;
const NOTE_CARD_MAX_LABEL_FONT_SIZE = 48;
const NOTE_CARD_MAX_FOLDED_FONT_SIZE = 24;

export function clampNoteAutoHeight(height: number): number {
  if (!Number.isFinite(height)) return NOTE_CARD_MIN_HEIGHT;
  return Math.min(NOTE_CARD_MAX_AUTO_HEIGHT, Math.max(NOTE_CARD_MIN_HEIGHT, Math.ceil(height)));
}

export function noteHeightChanged(previous: number, current: number): boolean {
  return Math.abs(previous - current) >= 4;
}

export function shouldSwitchNoteToFixedHeight({
  heightMode = "auto",
  previousHeight,
  currentHeight,
  expectedAutoFitHeight,
}: {
  heightMode?: "auto" | "fixed";
  previousHeight: number | undefined;
  currentHeight: number;
  expectedAutoFitHeight: number | undefined;
}): boolean {
  if (heightMode === "fixed" || previousHeight === undefined) return false;
  if (expectedAutoFitHeight !== undefined && !noteHeightChanged(expectedAutoFitHeight, currentHeight)) return false;
  return noteHeightChanged(previousHeight, currentHeight);
}

export function noteCardBodyMaxHeight(
  height: number,
  collapsed: boolean,
  heightMode: "auto" | "fixed" = "auto",
): number | undefined {
  if (collapsed) return undefined;
  if (heightMode === "fixed") return Math.max(80, height);
  return Math.max(height, NOTE_CARD_MAX_AUTO_HEIGHT);
}

type NoteCardFrame = {
  left: number;
  top: number;
  width: number;
  minHeight: number;
  height?: number;
  transform: string;
  transformOrigin: string;
};

/**
 * The card is laid out in Canvas units and scaled as one surface, so content wraps identically
 * at every zoom. Rotation follows Excalidraw: around the instance's geometric center.
 */
export function noteCardFrame(element: NoteCardGeometry, viewport: NoteCardViewport, collapsed: boolean): NoteCardFrame {
  const zoom = viewport.zoom > 0 && Number.isFinite(viewport.zoom) ? viewport.zoom : 1;
  const angle = element.angle ?? 0;
  const halfWidth = element.width / 2;
  const effectiveHeight = collapsed ? NOTE_CARD_FOLDED_HEIGHT : element.height;
  const halfHeight = effectiveHeight / 2;
  const rotation = angle ? ` translate(${halfWidth}px, ${halfHeight}px) rotate(${angle}rad) translate(${-halfWidth}px, ${-halfHeight}px)` : "";
  return {
    left: (element.x + viewport.scrollX) * zoom,
    top: (element.y + viewport.scrollY) * zoom,
    width: element.width,
    minHeight: collapsed ? NOTE_CARD_FOLDED_HEIGHT : element.height,
    ...(collapsed ? { height: NOTE_CARD_FOLDED_HEIGHT } : {}),
    transform: `scale(${zoom})${rotation}`,
    transformOrigin: "0 0",
  };
}

export type NoteCardDetail = "content" | "label";

export function noteCardDetail(zoom: number, editing: boolean): NoteCardDetail {
  return editing || zoom >= NOTE_CARD_LABEL_ZOOM ? "content" : "label";
}

/** Label text grows in Canvas units as the view zooms out so it stays readable on screen. */
export function noteCardLabelFontSize(zoom: number, folded = false): number {
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  const cap = folded ? NOTE_CARD_MAX_FOLDED_FONT_SIZE : NOTE_CARD_MAX_LABEL_FONT_SIZE;
  return Math.min(cap, Math.max(NOTE_CARD_BODY_FONT_SIZE, NOTE_CARD_BODY_FONT_SIZE * 0.8 / safeZoom));
}
