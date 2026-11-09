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
  wordWrap = true,
  preserveHeight,
  fitRevision = 0,
  onHeight,
}: {
  code: string;
  width: number;
  lineNumbers: boolean;
  wordWrap?: boolean;
  preserveHeight?: number;
  fitRevision?: number;
  onHeight: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => {
      const measured = clampCodeBlockHeight(
        preserveHeight ?? node.scrollHeight + CODE_BLOCK_BORDER_ALLOWANCE,
      );
      onHeightRef.current(measured);
    });
    return () => cancelAnimationFrame(frame);
  }, [code, lineNumbers, wordWrap, width, preserveHeight, fitRevision]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none fixed -left-[10000px] top-0 invisible ${wordWrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre"}`}
      style={{
        boxSizing: "border-box",
        tabSize: 2,
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
