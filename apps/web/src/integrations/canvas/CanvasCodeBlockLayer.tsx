import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  codeThemeSurface,
  codeTokenColor,
  detectCodeLanguage,
  highlightCodeLines,
  readCanvasCodeBlock,
  resolveCodeTheme,
  type CanvasCodeBlockData,
} from "./canvas-code-block";
import {
  CODE_BLOCK_BODY_PADDING_X,
  CODE_BLOCK_BODY_PADDING_Y,
  CODE_BLOCK_FONT_SIZE,
  CODE_BLOCK_LINE_HEIGHT,
  CODE_BLOCK_LINE_NUMBER_WIDTH,
} from "./canvas-code-block-layout";
import { CanvasCodeBlockMeasure } from "./CanvasCodeBlockMeasure";
import { canRunCanvasCode } from "./canvas-code-runner";
import type { CodeRunView } from "./use-canvas-code-runner";

type CanvasViewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
};

type CodeElement = OrderedExcalidrawElement & {
  customData?: Record<string, unknown>;
};

function runStatusLabel(run: CodeRunView) {
  if (run.status === "running") return "Running";
  if (run.status === "success") return `Done · ${run.durationMs} ms`;
  if (run.status === "timeout") return `Timed out · ${run.durationMs} ms`;
  if (run.status === "cancelled") return `Stopped · ${run.durationMs} ms`;
  return `Error · ${run.durationMs} ms`;
}

export function CanvasCodeBlockLayer({
  elements,
  viewport,
  appDark,
  selectedElementId,
  editingElementId,
  runs,
  onUpdate,
  onEditingChange,
  onRun,
  onClearRun,
  onAutoFit,
}: {
  elements: readonly OrderedExcalidrawElement[];
  viewport: CanvasViewport;
  appDark: boolean;
  selectedElementId: string | null;
  editingElementId: string | null;
  runs: Record<string, CodeRunView>;
  onUpdate: (elementId: string, block: CanvasCodeBlockData) => void;
  onEditingChange: (elementId: string | null) => void;
  onRun: (elementId: string, block: CanvasCodeBlockData) => void;
  onClearRun: (elementId: string) => void;
  onAutoFit: (elementId: string, height: number) => void;
}) {
  const codeElements = elements
    .filter((element) => !element.isDeleted)
    .map((element) => ({ element: element as CodeElement, block: readCanvasCodeBlock(element as CodeElement) }))
    .filter((entry): entry is { element: CodeElement; block: CanvasCodeBlockData } => entry.block !== null);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Canvas code blocks">
      {codeElements.map(({ element, block }) => {
        const resolvedTheme = resolveCodeTheme(block.theme, appDark);
        const palette = codeThemeSurface(resolvedTheme);
        const selected = selectedElementId === element.id;
        const editing = editingElementId === element.id;
        const run = runs[element.id];
        const effectiveLanguage = block.languageLocked ? block.language : detectCodeLanguage(block.code);
        const runnable = canRunCanvasCode(effectiveLanguage);
        const zoom = viewport.zoom;
        const left = (element.x + viewport.scrollX) * zoom;
        const top = (element.y + viewport.scrollY) * zoom;
        const width = Math.max(1, element.width * zoom);
        const height = Math.max(1, element.height * zoom);
        const highlightedLines = highlightCodeLines(block.code, effectiveLanguage);
        const paddingX = CODE_BLOCK_BODY_PADDING_X * zoom;
        const paddingY = CODE_BLOCK_BODY_PADDING_Y * zoom;
        const gutterWidth = CODE_BLOCK_LINE_NUMBER_WIDTH * zoom;
        const fontSize = CODE_BLOCK_FONT_SIZE * zoom;
        const lineHeight = CODE_BLOCK_LINE_HEIGHT * zoom;

        const update = (patch: Partial<CanvasCodeBlockData>) => {
          onUpdate(element.id, { ...block, ...patch });
        };

        const finishEditing = () => {
          if (!block.languageLocked) update({ language: detectCodeLanguage(block.code) });
          onEditingChange(null);
        };

        return (
          <div
            key={element.id}
            className="absolute overflow-visible"
            style={{
              left,
              top,
              width,
              transform: `rotate(${element.angle}rad)`,
              transformOrigin: "center",
              fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
              fontSize,
              lineHeight: `${lineHeight}px`,
            }}
          >
            {block.heightMode === "auto" && (
              <CanvasCodeBlockMeasure
                code={block.code}
                width={element.width}
                lineNumbers={block.lineNumbers}
                onHeight={(targetHeight) => onAutoFit(element.id, targetHeight)}
              />
            )}

            <section
              className={editing ? "pointer-events-auto overflow-hidden rounded-[6px]" : "overflow-hidden rounded-[6px]"}
              style={{
                width,
                height,
                background: palette.background,
                color: palette.foreground,
                border: `1px solid ${selected ? "#4f7396" : palette.border}`,
                boxShadow: selected ? "0 0 0 1px color-mix(in srgb, #4f7396 35%, transparent)" : "none",
              }}
              data-canvas-code-block={element.id}
              aria-label={`Code block, ${effectiveLanguage}`}
            >
              <div className="relative h-full min-h-0 overflow-hidden">
                <div
                  className="min-h-full min-w-0 overflow-x-hidden"
                  style={{
                    paddingTop: paddingY,
                    paddingBottom: paddingY,
                    transform: "translateY(var(--code-scroll-y, 0px))",
                  }}
                  aria-label={editing ? "Live syntax preview" : undefined}
                >
                  {highlightedLines.map((lineTokens, lineIndex) => (
                    <div
                      key={lineIndex}
                      className="grid min-w-0"
                      style={{ gridTemplateColumns: block.lineNumbers ? `${gutterWidth}px minmax(0,1fr)` : "minmax(0,1fr)" }}
                    >
                      {block.lineNumbers && (
                        <span
                          className="select-none text-right"
                          style={{ paddingRight: Math.max(3, 6 * zoom), color: palette.muted }}
                          aria-hidden="true"
                        >
                          {lineIndex + 1}
                        </span>
                      )}
                      <code
                        className="block min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]"
                        aria-label={lineIndex === 0 ? "Highlighted code" : undefined}
                        style={{
                          paddingLeft: paddingX,
                          paddingRight: paddingX,
                          color: palette.foreground,
                          fontSize,
                          lineHeight: `${lineHeight}px`,
                        }}
                      >
                        {lineTokens.map((token, tokenIndex) => (
                          <span key={tokenIndex} style={{ color: codeTokenColor(token.classes, resolvedTheme) }}>{token.text}</span>
                        ))}
                        {lineTokens.length === 0 ? "\u200b" : null}
                      </code>
                    </div>
                  ))}
                </div>

                {editing && (
                  <textarea
                    autoFocus
                    wrap="soft"
                    spellCheck={false}
                    value={block.code}
                    aria-label="Edit code block"
                    className="absolute inset-0 h-full w-full resize-none overflow-x-hidden border-0 bg-transparent font-[inherit] outline-none whitespace-pre-wrap [overflow-wrap:anywhere]"
                    style={{
                      boxSizing: "border-box",
                      color: "transparent",
                      caretColor: palette.foreground,
                      WebkitTextFillColor: "transparent",
                      tabSize: 2,
                      paddingTop: paddingY,
                      paddingBottom: paddingY,
                      paddingLeft: (block.lineNumbers ? gutterWidth : 0) + paddingX,
                      paddingRight: paddingX,
                      fontSize,
                      lineHeight: `${lineHeight}px`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onScroll={(event) => {
                      event.currentTarget.parentElement?.style.setProperty("--code-scroll-y", `${-event.currentTarget.scrollTop}px`);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.currentTarget.parentElement?.style.setProperty("--code-scroll-y", "0px");
                        finishEditing();
                        return;
                      }
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        if (runnable) onRun(element.id, block);
                        else finishEditing();
                        return;
                      }
                      if (event.key === "Tab") {
                        event.preventDefault();
                        const target = event.currentTarget;
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        const nextCode = `${block.code.slice(0, start)}  ${block.code.slice(end)}`;
                        update({
                          code: nextCode,
                          ...(!block.languageLocked ? { language: detectCodeLanguage(nextCode) } : {}),
                        });
                        requestAnimationFrame(() => {
                          target.selectionStart = target.selectionEnd = start + 2;
                        });
                      }
                    }}
                    onChange={(event) => {
                      const code = event.target.value;
                      update({
                        code,
                        ...(!block.languageLocked ? { language: detectCodeLanguage(code) } : {}),
                      });
                    }}
                    onBlur={(event) => {
                      event.currentTarget.parentElement?.style.setProperty("--code-scroll-y", "0px");
                      finishEditing();
                    }}
                  />
                )}
              </div>
            </section>

            {run && (
              <div
                className={selected ? "pointer-events-auto mt-1 max-h-24 overflow-auto rounded-md border px-2 py-1.5" : "mt-1 max-h-24 overflow-auto rounded-md border px-2 py-1.5"}
                style={{
                  width,
                  background: palette.toolbar,
                  color: palette.foreground,
                  borderColor: palette.border,
                  fontSize: Math.max(9, 10 * zoom),
                  lineHeight: `${Math.max(12, 15 * zoom)}px`,
                }}
                aria-label="Code output"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{runStatusLabel(run)}</span>
                  {selected && run.status !== "running" && (
                    <button
                      type="button"
                      className="rounded px-1 hover:bg-black/10"
                      aria-label="Clear code output"
                      onClick={() => onClearRun(element.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
                {run.stdout.map((line, index) => <div key={`out-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{line}</div>)}
                {run.stderr.map((line, index) => <div key={`err-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: resolvedTheme === "dark" ? "#ff6b68" : "#b91c1c" }}>{line}</div>)}
                {"result" in run && run.result !== undefined && <div className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]"><span style={{ color: palette.muted }}>↳ </span>{run.result}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
