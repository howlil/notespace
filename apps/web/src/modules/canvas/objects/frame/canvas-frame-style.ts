export const FRAME_STYLE_DATA_KEY = "notespaceFrameStyle";

export type CanvasFrameStyle = {
  strokeColor?: string;
  backgroundColor?: string;
};

type FrameElementLike = {
  type?: string;
  customData?: Record<string, unknown>;
};

export function isFrameElement(element: FrameElementLike | null | undefined): boolean {
  return element?.type === "frame" || element?.type === "magicframe";
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "transparent") return undefined;
  return trimmed;
}

export function readCanvasFrameStyle(element: FrameElementLike | null | undefined): CanvasFrameStyle | null {
  if (!isFrameElement(element)) return null;
  const raw = element?.customData?.[FRAME_STYLE_DATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const strokeColor = normalizeColor(record.strokeColor);
  const backgroundColor = normalizeColor(record.backgroundColor);
  if (!strokeColor && !backgroundColor) return null;
  return { strokeColor, backgroundColor };
}

export function withCanvasFrameStyle(
  customData: Record<string, unknown> | undefined,
  patch: Partial<CanvasFrameStyle>,
): Record<string, unknown> {
  const existing = (customData?.[FRAME_STYLE_DATA_KEY] && typeof customData[FRAME_STYLE_DATA_KEY] === "object")
    ? (customData[FRAME_STYLE_DATA_KEY] as Record<string, unknown>)
    : {};
  const nextStroke = "strokeColor" in patch ? normalizeColor(patch.strokeColor) : normalizeColor(existing.strokeColor);
  const nextBackground = "backgroundColor" in patch ? normalizeColor(patch.backgroundColor) : normalizeColor(existing.backgroundColor);
  const nextCustomData: Record<string, unknown> = { ...(customData ?? {}) };
  if (!nextStroke && !nextBackground) {
    delete nextCustomData[FRAME_STYLE_DATA_KEY];
    return nextCustomData;
  }
  nextCustomData[FRAME_STYLE_DATA_KEY] = {
    ...(nextStroke ? { strokeColor: nextStroke } : {}),
    ...(nextBackground ? { backgroundColor: nextBackground } : {}),
  };
  return nextCustomData;
}
