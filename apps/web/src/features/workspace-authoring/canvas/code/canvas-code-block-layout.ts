export const CODE_BLOCK_DEFAULT_WIDTH = 360;
export const CODE_BLOCK_FONT_SIZE = 11;
export const CODE_BLOCK_LINE_HEIGHT = 17;
export const CODE_BLOCK_BODY_PADDING_X = 8;
export const CODE_BLOCK_BODY_PADDING_Y = 8;
export const CODE_BLOCK_LINE_NUMBER_WIDTH = 30;
export const CODE_BLOCK_OUTPUT_SPLIT_WIDTH = 560;

export function codeBlockOutputLayout(renderedWidth: number) {
  return renderedWidth >= CODE_BLOCK_OUTPUT_SPLIT_WIDTH ? "split" : "stack";
}
export const CODE_BLOCK_BORDER_ALLOWANCE = 2;

export function codeBlockContentWidth(width: number, lineNumbers: boolean) {
  const gutter = lineNumbers ? CODE_BLOCK_LINE_NUMBER_WIDTH : 0;
  return Math.max(
    1,
    width - gutter - (CODE_BLOCK_BODY_PADDING_X * 2) - CODE_BLOCK_BORDER_ALLOWANCE,
  );
}

export function codeBlockIntersectsViewport({
  x,
  y,
  width,
  height,
  angle,
  zoom,
  scrollX,
  scrollY,
  viewportWidth,
  viewportHeight,
  overscan = 160,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  overscan?: number;
}) {
  if (viewportWidth <= 0 || viewportHeight <= 0) return true;
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;
  const centerX = (x + scrollX) * zoom + scaledWidth / 2;
  const centerY = (y + scrollY) * zoom + scaledHeight / 2;
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const halfWidth = (scaledWidth * cosine + scaledHeight * sine) / 2;
  const halfHeight = (scaledWidth * sine + scaledHeight * cosine) / 2;

  return centerX + halfWidth >= -overscan
    && centerX - halfWidth <= viewportWidth + overscan
    && centerY + halfHeight >= -overscan
    && centerY - halfHeight <= viewportHeight + overscan;
}

export function codeBlockMinimumHeight() {
  return CODE_BLOCK_LINE_HEIGHT
    + (CODE_BLOCK_BODY_PADDING_Y * 2)
    + CODE_BLOCK_BORDER_ALLOWANCE;
}

export function clampCodeBlockHeight(height: number) {
  return Math.max(codeBlockMinimumHeight(), Math.ceil(height));
}

export function codeBlockHeightChanged(previous: number, current: number) {
  return Math.abs(previous - current) >= 1;
}

export function shouldSwitchCodeBlockToManualHeight({
  heightMode,
  previousHeight,
  currentHeight,
  expectedAutoFitHeight,
}: {
  heightMode: "auto" | "manual";
  previousHeight: number | undefined;
  currentHeight: number;
  expectedAutoFitHeight: number | undefined;
}) {
  if (heightMode !== "auto" || previousHeight === undefined) return false;
  if (expectedAutoFitHeight !== undefined && !codeBlockHeightChanged(expectedAutoFitHeight, currentHeight)) return false;
  return codeBlockHeightChanged(previousHeight, currentHeight);
}
