export type NoteMark = { type: string; attrs?: Record<string, unknown> };

export type NoteNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoteNode[];
  marks?: NoteMark[];
  text?: string;
};

export type NoteDocument = { type: "doc"; content: NoteNode[] };

export type CanvasNoteReference = { noteId: string; instanceId: string };

export const CANVAS_NOTE_DATA_KEY = "notespaceNote";

export function emptyNoteDocument(): NoteDocument {
  return { type: "doc", content: [] };
}

export function readCanvasNoteReference(element: { customData?: unknown; isDeleted?: boolean } | null | undefined): CanvasNoteReference | null {
  if (!element || element.isDeleted) return null;
  const customData = element.customData;
  if (!customData || typeof customData !== "object") return null;
  const reference = (customData as Record<string, unknown>)[CANVAS_NOTE_DATA_KEY];
  if (!reference || typeof reference !== "object") return null;
  const { noteId, instanceId } = reference as Record<string, unknown>;
  return typeof noteId === "string" && noteId.length > 0 && typeof instanceId === "string" && instanceId.length > 0
    ? { noteId, instanceId }
    : null;
}

export function withCanvasNoteReference(customData: unknown, reference: CanvasNoteReference): Record<string, unknown> {
  return {
    ...(customData && typeof customData === "object" ? customData as Record<string, unknown> : {}),
    [CANVAS_NOTE_DATA_KEY]: reference,
  };
}

export function notePlacement({
  viewportWidth,
  viewportHeight,
  zoom,
  scrollX,
  scrollY,
  width = 320,
  height = 180,
  occupied,
}: {
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  width?: number;
  height?: number;
  occupied: ReadonlyArray<{ x: number; y: number; width: number; height: number; isDeleted?: boolean }>;
}) {
  const centerX = viewportWidth / (2 * zoom) - scrollX - width / 2;
  const centerY = viewportHeight / (2 * zoom) - scrollY - height / 2;
  const candidates = [{ x: centerX, y: centerY }, ...Array.from({ length: 8 }, (_, index) => {
    const radius = 48 + Math.floor(index / 2) * 56;
    const angle = (index % 2 === 0 ? 1 : -1) * Math.ceil(index / 2) * Math.PI / 4;
    return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
  })];
  const overlaps = (candidate: { x: number; y: number }) => occupied.some((item) => {
    if (item.isDeleted) return false;
    return candidate.x < item.x + item.width && candidate.x + width > item.x && candidate.y < item.y + item.height && candidate.y + height > item.y;
  });
  return candidates.find((candidate) => !overlaps(candidate)) ?? candidates[0];
}
