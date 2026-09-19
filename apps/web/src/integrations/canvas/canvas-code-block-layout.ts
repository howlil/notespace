export const CODE_BLOCK_DEFAULT_WIDTH = 360;
export const CODE_BLOCK_MIN_WIDTH = 160;
export const CODE_BLOCK_FONT_SIZE = 11;
export const CODE_BLOCK_LINE_HEIGHT = 17;
export const CODE_BLOCK_BODY_PADDING_X = 8;
export const CODE_BLOCK_BODY_PADDING_Y = 8;
export const CODE_BLOCK_LINE_NUMBER_WIDTH = 30;
export const CODE_BLOCK_BORDER_ALLOWANCE = 2;

export function codeBlockContentWidth(width: number, lineNumbers: boolean) {
  const gutter = lineNumbers ? CODE_BLOCK_LINE_NUMBER_WIDTH : 0;
  return Math.max(
    1,
    width - gutter - (CODE_BLOCK_BODY_PADDING_X * 2) - CODE_BLOCK_BORDER_ALLOWANCE,
  );
}

export function codeBlockMinimumHeight() {
  return CODE_BLOCK_LINE_HEIGHT + (CODE_BLOCK_BODY_PADDING_Y * 2) + CODE_BLOCK_BORDER_ALLOWANCE;
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
