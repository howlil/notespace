export type NoteCardViewport = { zoom: number; scrollX: number; scrollY: number };
export type NoteCardGeometry = { x: number; y: number; width: number; height: number; angle?: number };

/** Below this zoom a card shows only its derived first line (B9a level of detail). */
export const NOTE_CARD_LABEL_ZOOM = 0.35;
const NOTE_CARD_BODY_FONT_SIZE = 14;
const NOTE_CARD_MAX_LABEL_FONT_SIZE = 48;

export type NoteCardFrame = {
  left: number;
  top: number;
  width: number;
  minHeight: number;
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
  const halfHeight = element.height / 2;
  const rotation = angle ? ` translate(${halfWidth}px, ${halfHeight}px) rotate(${angle}rad) translate(${-halfWidth}px, ${-halfHeight}px)` : "";
  return {
    left: (element.x + viewport.scrollX) * zoom,
    top: (element.y + viewport.scrollY) * zoom,
    width: element.width,
    // A folded card is only its first line, so its height follows that line instead of the instance.
    minHeight: collapsed ? 0 : element.height,
    transform: `scale(${zoom})${rotation}`,
    transformOrigin: "0 0",
  };
}

export type NoteCardDetail = "content" | "label";

export function noteCardDetail(zoom: number, editing: boolean): NoteCardDetail {
  return editing || zoom >= NOTE_CARD_LABEL_ZOOM ? "content" : "label";
}

/** Label text grows in Canvas units as the view zooms out so it stays readable on screen. */
export function noteCardLabelFontSize(zoom: number): number {
  const safeZoom = zoom > 0 && Number.isFinite(zoom) ? zoom : 1;
  return Math.min(NOTE_CARD_MAX_LABEL_FONT_SIZE, Math.max(NOTE_CARD_BODY_FONT_SIZE, NOTE_CARD_BODY_FONT_SIZE * 0.8 / safeZoom));
}

/** Contextual UI inside a scaled card is counter-scaled so menus keep their screen size. */
export function noteCardUiScale(zoom: number): number {
  return zoom > 0 && Number.isFinite(zoom) ? 1 / zoom : 1;
}
