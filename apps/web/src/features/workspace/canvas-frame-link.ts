import type { Snapshot } from "../../domain/project/project";

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
    ...(textValue(element) ? { text: textValue(element)?.slice(0, 240) } : {}),
    ...(typeof element.fontSize === "number" ? { fontSize: Math.max(8, Math.min(48, element.fontSize)) } : {}),
    ...(pointsValue(element, frameX, frameY)?.length ? { points: pointsValue(element, frameX, frameY) } : {}),
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

export function canvasFrameLinkFromElements(elements: readonly RawElement[], frameId: string): CanvasFrameLinkData | null {
  const frameIndex = elements.findIndex((element) => element.id === frameId && element.type === "frame" && element.isDeleted !== true);
  const frame = frameIndex >= 0 ? elements[frameIndex] : null;
  if (!frame) return null;
  const frameX = finite(frame.x);
  const frameY = finite(frame.y);
  const width = Math.max(1, finite(frame.width, 1));
  const height = Math.max(1, finite(frame.height, 1));
  const byId = new Map(elements.filter((element) => typeof element.id === "string").map((element) => [element.id as string, element]));
  const belongsToFrame = (element: RawElement) => {
    let parentId = typeof element.frameId === "string" ? element.frameId : null;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      if (parentId === frameId) return true;
      visited.add(parentId);
      const parent = byId.get(parentId);
      parentId = parent && typeof parent.frameId === "string" ? parent.frameId : null;
    }
    return false;
  };
  const children = elements.filter((element) => element.isDeleted !== true && element.id !== frameId && belongsToFrame(element));
  return {
    frameId,
    label: frameLabel(frame, frameIndex),
    width,
    height,
    elementCount: children.length,
    elements: children.map((element) => previewElement(element, frameX, frameY)).filter((value): value is CanvasFramePreviewElement => value !== null),
  };
}

export function canvasFrameLinkFromSnapshot(snapshot: Snapshot | null | undefined, frameId: string) {
  return canvasFrameLinkFromElements(rawElements(snapshot), frameId);
}

export function listCanvasFrameLinks(snapshot: Snapshot | null | undefined): CanvasFrameLinkData[] {
  const elements = rawElements(snapshot);
  return elements
    .filter((element) => element.type === "frame" && element.isDeleted !== true && typeof element.id === "string")
    .map((frame) => canvasFrameLinkFromElements(elements, frame.id as string))
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
