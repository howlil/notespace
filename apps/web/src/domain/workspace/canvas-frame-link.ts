import type { Snapshot } from "../../domain/project/project";

export const MAX_FRAME_PREVIEW_ELEMENTS = 160;

export type CanvasFramePreviewElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  text?: string;
  fontSize?: number;
  fileId?: string;
  scale?: [number, number];
  points?: Array<[number, number]>;
};

export type CanvasFrameLinkData = {
  frameId: string;
  label: string;
  width: number;
  height: number;
  elementCount: number;
  elements: CanvasFramePreviewElement[];
};

type RawElement = Record<string, unknown>;

type CanvasFrameIndex = {
  frames: RawElement[];
  frameById: Map<string, RawElement>;
  frameOrder: Map<string, number>;
  childrenByFrame: Map<string, RawElement[]>;
};

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textValue(element: RawElement) {
  if (typeof element.text === "string") return element.text;
  if (typeof element.originalText === "string") return element.originalText;
  const customData = element.customData && typeof element.customData === "object"
    ? element.customData as Record<string, unknown>
    : null;
  const codeBlock = customData?.notespaceCodeBlock && typeof customData.notespaceCodeBlock === "object"
    ? customData.notespaceCodeBlock as Record<string, unknown>
    : null;
  return typeof codeBlock?.code === "string" ? codeBlock.code : undefined;
}

function pointsValue(element: RawElement, frameX: number, frameY: number): Array<[number, number]> | undefined {
  if (!Array.isArray(element.points)) return undefined;
  const originX = finite(element.x) - frameX;
  const originY = finite(element.y) - frameY;
  const points = element.points.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const x = finite(point[0], Number.NaN);
    const y = finite(point[1], Number.NaN);
    return Number.isFinite(x) && Number.isFinite(y) ? [[originX + x, originY + y] as [number, number]] : [];
  });
  if (points.length <= 40) return points;
  const step = Math.ceil(points.length / 40);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function previewElement(element: RawElement, frameX: number, frameY: number): CanvasFramePreviewElement | null {
  if (element.isDeleted === true || typeof element.id !== "string" || typeof element.type !== "string") return null;
  const text = textValue(element);
  const points = pointsValue(element, frameX, frameY);
  return {
    id: element.id,
    type: element.type,
    x: finite(element.x) - frameX,
    y: finite(element.y) - frameY,
    width: Math.max(1, finite(element.width, 1)),
    height: Math.max(1, finite(element.height, 1)),
    angle: finite(element.angle),
    strokeColor: typeof element.strokeColor === "string" ? element.strokeColor : "#6b7280",
    backgroundColor: typeof element.backgroundColor === "string" ? element.backgroundColor : "transparent",
    strokeWidth: Math.max(1, finite(element.strokeWidth, 1)),
    ...(text ? { text: text.slice(0, 240) } : {}),
    ...(typeof element.fontSize === "number" ? { fontSize: Math.max(8, Math.min(48, element.fontSize)) } : {}),
    ...(typeof element.fileId === "string" && element.fileId ? { fileId: element.fileId } : {}),
    ...(Array.isArray(element.scale) && element.scale.length >= 2
      ? { scale: [finite(element.scale[0], 1), finite(element.scale[1], 1)] as [number, number] }
      : {}),
    ...(points?.length ? { points } : {}),
  };
}

function rawElements(snapshot: Snapshot | null | undefined) {
  const elements = snapshot?.data?.elements;
  return Array.isArray(elements)
    ? elements.filter((value): value is RawElement => Boolean(value && typeof value === "object"))
    : [];
}

function frameLabel(frame: RawElement, index = 0) {
  const named = typeof frame.name === "string" ? frame.name.trim() : "";
  return named || `Frame ${index + 1}`;
}

function buildFrameIndex(elements: readonly RawElement[]): CanvasFrameIndex {
  const frames: RawElement[] = [];
  const frameById = new Map<string, RawElement>();
  const frameOrder = new Map<string, number>();
  const childrenByFrame = new Map<string, RawElement[]>();

  elements.forEach((element, index) => {
    if (element.isDeleted === true) return;
    const id = typeof element.id === "string" ? element.id : null;
    if (id && element.type === "frame") {
      frames.push(element);
      frameById.set(id, element);
      frameOrder.set(id, index);
    }
    const parentId = typeof element.frameId === "string" ? element.frameId : null;
    if (!parentId) return;
    const children = childrenByFrame.get(parentId);
    if (children) children.push(element);
    else childrenByFrame.set(parentId, [element]);
  });

  return { frames, frameById, frameOrder, childrenByFrame };
}

function frameDescendants(index: CanvasFrameIndex, frameId: string) {
  const pending = [...(index.childrenByFrame.get(frameId) ?? [])];
  const descendants: RawElement[] = [];
  const visited = new Set<string>();

  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const element = pending[cursor];
    if (element.isDeleted === true) continue;
    const id = typeof element.id === "string" ? element.id : null;
    if (id) {
      if (visited.has(id)) continue;
      visited.add(id);
    }
    descendants.push(element);
    if (id) pending.push(...(index.childrenByFrame.get(id) ?? []));
  }

  return descendants;
}

function boundedPreviewElements(elements: readonly RawElement[]) {
  if (elements.length <= MAX_FRAME_PREVIEW_ELEMENTS) return elements;
  const step = elements.length / MAX_FRAME_PREVIEW_ELEMENTS;
  return Array.from(
    { length: MAX_FRAME_PREVIEW_ELEMENTS },
    (_, index) => elements[Math.min(elements.length - 1, Math.floor(index * step))],
  );
}

function canvasFrameLinkFromIndex(index: CanvasFrameIndex, frameId: string): CanvasFrameLinkData | null {
  const frame = index.frameById.get(frameId);
  if (!frame) return null;
  const frameX = finite(frame.x);
  const frameY = finite(frame.y);
  const width = Math.max(1, finite(frame.width, 1));
  const height = Math.max(1, finite(frame.height, 1));
  const children = frameDescendants(index, frameId);
  const previewChildren = boundedPreviewElements(children);

  return {
    frameId,
    label: frameLabel(frame, index.frameOrder.get(frameId) ?? 0),
    width,
    height,
    elementCount: children.length,
    elements: previewChildren
      .map((element) => previewElement(element, frameX, frameY))
      .filter((value): value is CanvasFramePreviewElement => value !== null),
  };
}

export function canvasFrameLinkFromElements(elements: readonly RawElement[], frameId: string): CanvasFrameLinkData | null {
  return canvasFrameLinkFromIndex(buildFrameIndex(elements), frameId);
}

export function canvasFrameLinkFromSnapshot(snapshot: Snapshot | null | undefined, frameId: string) {
  return canvasFrameLinkFromElements(rawElements(snapshot), frameId);
}

export function listCanvasFrameLinks(snapshot: Snapshot | null | undefined): CanvasFrameLinkData[] {
  const index = buildFrameIndex(rawElements(snapshot));
  return index.frames
    .map((frame) => typeof frame.id === "string" ? canvasFrameLinkFromIndex(index, frame.id) : null)
    .filter((value): value is CanvasFrameLinkData => value !== null);
}

export function canvasFrameLinkFromClipboard(text: string, fallbackSnapshot?: Snapshot | null): CanvasFrameLinkData | null {
  if (!text.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as { type?: unknown; elements?: unknown };
    if (parsed.type !== "excalidraw/clipboard" || !Array.isArray(parsed.elements)) return null;
    const elements = parsed.elements.filter((value): value is RawElement => Boolean(value && typeof value === "object"));
    const frames = elements.filter((element) => element.type === "frame" && element.isDeleted !== true && typeof element.id === "string");
    if (frames.length !== 1) return null;
    const frameId = frames[0].id as string;
    return canvasFrameLinkFromSnapshot(fallbackSnapshot, frameId) ?? canvasFrameLinkFromElements(elements, frameId);
  } catch {
    return null;
  }
}
