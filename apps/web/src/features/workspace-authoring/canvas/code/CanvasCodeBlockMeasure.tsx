import { useLayoutEffect, useRef } from "react";
import {
  CODE_BLOCK_BODY_PADDING_Y,
  CODE_BLOCK_FONT_SIZE,
  CODE_BLOCK_LINE_HEIGHT,
  CODE_BLOCK_BORDER_ALLOWANCE,
  clampCodeBlockHeight,
  codeBlockContentWidth,
} from "./canvas-code-block-layout";

export function CanvasCodeBlockMeasure({
  code,
  width,
  lineNumbers,
  onHeight,
}: {
  code: string;
  width: number;
  lineNumbers: boolean;
  onHeight: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const measured = clampCodeBlockHeight(node.scrollHeight + CODE_BLOCK_BORDER_ALLOWANCE);
      onHeight(measured);
    });
    return () => cancelAnimationFrame(frame);
  }, [code, lineNumbers, onHeight, width]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed -left-[10000px] top-0 invisible whitespace-pre-wrap [overflow-wrap:anywhere]"
      style={{
        boxSizing: "border-box",
        width: codeBlockContentWidth(width, lineNumbers),
        minHeight: CODE_BLOCK_LINE_HEIGHT,
        paddingTop: CODE_BLOCK_BODY_PADDING_Y,
        paddingBottom: CODE_BLOCK_BODY_PADDING_Y,
        fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
        fontSize: CODE_BLOCK_FONT_SIZE,
        lineHeight: `${CODE_BLOCK_LINE_HEIGHT}px`,
      }}
    >
      {code || "\u200b"}
    </div>
  );
}
