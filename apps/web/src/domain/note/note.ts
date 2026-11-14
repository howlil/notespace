export type NoteMark = { type: string; attrs?: Record<string, unknown> };

export type NoteNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: NoteNode[];
  marks?: NoteMark[];
  text?: string;
};

export type NoteDocument = { type: "doc"; content: NoteNode[] };

export type CanvasNoteReference = { noteId: string; instanceId: string; compact?: boolean };

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
    ? { noteId, instanceId, ...(typeof (reference as Record<string, unknown>).compact === "boolean" ? { compact: (reference as Record<string, unknown>).compact as boolean } : {}) }
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
  const overlaps = (candidate: { x: number; y: number }) => occupied.some((item) => {
    if (item.isDeleted) return false;
    return candidate.x < item.x + item.width && candidate.x + width > item.x && candidate.y < item.y + item.height && candidate.y + height > item.y;
  });
  // Spiral outward from the viewport center; each ring is wider so dense clusters are escaped.
  const maxRings = 12;
  for (let ring = 0; ring <= maxRings; ring += 1) {
    const count = ring === 0 ? 1 : 8 * ring;
    const radius = ring * 72;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      const candidate = ring === 0
        ? { x: centerX, y: centerY }
        : { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
      if (!overlaps(candidate)) return candidate;
    }
  }
  // Last resort: beside everything that exists, so a new Note is never hidden under another card.
  const rightEdge = occupied.reduce((edge, item) => (item.isDeleted ? edge : Math.max(edge, item.x + item.width)), centerX);
  return { x: rightEdge + 24, y: centerY };
}

const NOTE_LABEL_MAX_LENGTH = 120;

/** Derived label: the first non-empty text block, never a stored title field (C2). */
export function noteFirstLine(document: NoteDocument): string {
  const textOf = (node: NoteNode): string => (node.text ?? "") + (node.content ?? []).map(textOf).join("");
  const firstText = (nodes: readonly NoteNode[]): string => {
    for (const node of nodes) {
      const isTextBlock = node.content?.some((child) => child.type === "text") ?? false;
      const text = isTextBlock ? textOf(node).replace(/\s+/g, " ").trim() : firstText(node.content ?? []);
      if (text) return text;
    }
    return "";
  };
  const line = firstText(document.content);
  return line.length > NOTE_LABEL_MAX_LENGTH ? `${line.slice(0, NOTE_LABEL_MAX_LENGTH - 1).trimEnd()}…` : line;
}

/** Block nodes that carry a stable `blockId` for block references (mirrors the server contract). */
export const NOTE_BLOCK_NODE_TYPES: ReadonlySet<string> = new Set([
  "paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "taskList", "table",
  "horizontalRule", "noteImage", "noteEmbed", "noteBlockReference", "noteCallout",
]);

const NOTE_BLOCK_ID_MAX_LENGTH = 128;

export function isValidNoteBlockId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= NOTE_BLOCK_ID_MAX_LENGTH
    && value.trim() === value && !value.includes("/") && !value.includes("\\");
}

/**
 * Every block keeps a present, valid and unique identity. Returns the keys (in document order)
 * of blocks that need a fresh id: missing/invalid ids and every later duplicate of an id.
 */
export function noteBlockIdRepairs<Key>(blocks: Iterable<{ key: Key; type: string; blockId: unknown }>): Key[] {
  const seen = new Set<string>();
  const repairs: Key[] = [];
  for (const block of blocks) {
    if (!NOTE_BLOCK_NODE_TYPES.has(block.type)) continue;
    if (!isValidNoteBlockId(block.blockId) || seen.has(block.blockId)) {
      repairs.push(block.key);
      continue;
    }
    seen.add(block.blockId);
  }
  return repairs;
}

/**
 * Native duplication (Ctrl+D, Alt+drag, paste) copies `customData`, so a copy shares its
 * original's `instanceId`. The first live occurrence in scene order keeps the identity; every
 * later live element with the same instance is a copy that needs its own Note.
 */
export function duplicatedNoteInstanceIds(elements: ReadonlyArray<{ id: string; isDeleted?: boolean; customData?: unknown }>): string[] {
  const seen = new Set<string>();
  const copies: string[] = [];
  for (const element of elements) {
    const reference = readCanvasNoteReference(element);
    if (!reference) continue;
    if (seen.has(reference.instanceId)) copies.push(element.id);
    else seen.add(reference.instanceId);
  }
  return copies;
}
