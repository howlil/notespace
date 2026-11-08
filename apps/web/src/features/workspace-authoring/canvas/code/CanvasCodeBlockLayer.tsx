import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Check, ChevronDown, ChevronUp, Clipboard, Code2, Play, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  codeLanguageOptions,
  codeThemeSurface,
  codeTokenColor,
  detectCodeLanguage,
  highlightCodeLines,
  readCanvasCodeBlock,
  resolveCodeTheme,
  type CanvasCodeBlockData,
} from "./canvas-code-block";
import {
  CODE_BLOCK_BORDER_ALLOWANCE,
  codeBlockIntersectsViewport,
  CODE_BLOCK_BODY_PADDING_X,
  CODE_BLOCK_BODY_PADDING_Y,
  CODE_BLOCK_FONT_SIZE,
  CODE_BLOCK_HEADER_HEIGHT,
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

function HighlightedCodeLines({
  code,
  language,
  resolvedTheme,
  foreground,
  muted,
  lineNumbers,
  zoom,
  gutterWidth,
  paddingX,
  fontSize,
  lineHeight,
}: {
  code: string;
  language: string;
  resolvedTheme: "light" | "dark";
  foreground: string;
  muted: string;
  lineNumbers: boolean;
  zoom: number;
  gutterWidth: number;
  paddingX: number;
  fontSize: number;
  lineHeight: number;
}) {
  const highlightedLines = useMemo(() => highlightCodeLines(code, language), [code, language]);
  return (
    <>
      {highlightedLines.map((lineTokens, lineIndex) => (
        <div
          key={lineIndex}
          className="grid min-w-0"
          style={{ gridTemplateColumns: lineNumbers ? `${gutterWidth}px minmax(0,1fr)` : "minmax(0,1fr)" }}
        >
          {lineNumbers && (
            <span
              className="select-none text-right"
              style={{ paddingRight: Math.max(3, 6 * zoom), color: muted }}
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
              color: foreground,
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
    </>
  );
}

function codeLanguageLabel(language: string) {
  return codeLanguageOptions.find(([value]) => value === language)?.[1] ?? language;
}

function CanvasCodeBlockHeader({
  elementId,
  block,
  language,
  selected,
  runnable,
  run,
  height,
  fontSize,
  palette,
  onRun,
  onStop,
}: {
  elementId: string;
  block: CanvasCodeBlockData;
  language: string;
  selected: boolean;
  runnable: boolean;
  run?: CodeRunView;
  height: number;
  fontSize: number;
  palette: ReturnType<typeof codeThemeSurface>;
  onRun: () => void;
  onStop: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedReset = useRef<number | null>(null);
  const languageLabel = codeLanguageLabel(language);
  const controlSize = Math.max(1, Math.min(28, height - 4));
  const iconSize = Math.max(1, Math.round(controlSize * 0.55));

  useEffect(() => () => {
    if (copiedReset.current !== null) window.clearTimeout(copiedReset.current);
  }, []);

  const copyCode = () => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(block.code).then(() => {
      setCopied(true);
      if (copiedReset.current !== null) window.clearTimeout(copiedReset.current);
      copiedReset.current = window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => undefined);
  };

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-1 border-b px-2 font-sans"
      style={{
        height,
        minHeight: height,
        background: palette.toolbar,
        borderColor: palette.border,
        color: palette.foreground,
        fontSize: Math.max(1, Math.min(11, fontSize)),
        lineHeight: 1,
      }}
      data-canvas-code-header={elementId}
      aria-label={"Code block header, " + languageLabel}
    >
      <span className="flex min-w-0 items-center gap-1">
        <Code2 className="shrink-0" style={{ width: iconSize, height: iconSize, color: palette.muted }} strokeWidth={1.5} aria-hidden="true" />
        <span className="truncate font-medium">{languageLabel}</span>
        {!block.languageLocked && <span className="shrink-0" style={{ color: palette.muted }}>Auto</span>}
      </span>
      {selected && (
        <span className="flex shrink-0 items-center gap-1">
          {run && <span className="pointer-events-none truncate" aria-hidden="true" style={{ color: palette.muted }}>{runStatusLabel(run)}</span>}
          {runnable && (
            <button
              type="button"
              className="pointer-events-auto grid shrink-0 place-items-center rounded-md transition-[color,background-color] duration-100 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              style={{ width: controlSize, height: controlSize, color: palette.foreground }}
              aria-label={run?.status === "running" ? "Stop JavaScript" : "Run JavaScript"}
              title={run?.status === "running" ? "Stop JavaScript" : "Run JavaScript"}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (run?.status === "running") onStop();
                else onRun();
              }}
            >
              {run?.status === "running"
                ? <Square style={{ width: iconSize - 1, height: iconSize - 1 }} fill="currentColor" aria-hidden="true" />
                : <Play style={{ width: iconSize, height: iconSize }} fill="currentColor" aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className="pointer-events-auto grid shrink-0 place-items-center rounded-md transition-[color,background-color] duration-100 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{ width: controlSize, height: controlSize, color: palette.foreground }}
            aria-label={copied ? "Code copied" : "Copy code"}
            title={copied ? "Code copied" : "Copy code"}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              copyCode();
            }}
          >
            {copied
              ? <Check style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
              : <Clipboard style={{ width: iconSize, height: iconSize }} aria-hidden="true" />}
          </button>
        </span>
      )}
    </header>
  );
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
  onStop,
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
  onStop: (elementId: string) => void;
  onClearRun: (elementId: string) => void;
  onAutoFit: (elementId: string, height: number) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [layerSize, setLayerSize] = useState({ width: 0, height: 0 });
  const [collapsedOutputIds, setCollapsedOutputIds] = useState<Set<string>>(() => new Set());
  const codeElements = elements
    .filter((element) => !element.isDeleted)
    .map((element) => ({ element: element as CodeElement, block: readCanvasCodeBlock(element as CodeElement) }))
    .filter((entry): entry is { element: CodeElement; block: CanvasCodeBlockData } => entry.block !== null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      setLayerSize((current) => current.width === next.width && current.height === next.height ? current : next);
    });
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const visibleCodeElements = codeElements.filter(({ element }) => (
    element.id === selectedElementId
    || element.id === editingElementId
    || codeBlockIntersectsViewport({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      angle: element.angle,
      zoom: viewport.zoom,
      scrollX: viewport.scrollX,
      scrollY: viewport.scrollY,
      viewportWidth: layerSize.width,
      viewportHeight: layerSize.height,
    })
  ));

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Canvas code blocks">
      {codeElements.map(({ element, block }) => block.heightMode === "auto" ? (
        <CanvasCodeBlockMeasure
          key={`measure-${element.id}`}
          code={block.code}
          width={element.width}
          lineNumbers={block.lineNumbers}
          onHeight={(targetHeight) => onAutoFit(element.id, targetHeight)}
        />
      ) : null)}
      {visibleCodeElements.map(({ element, block }) => {
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
        const paddingX = CODE_BLOCK_BODY_PADDING_X * zoom;
        const paddingY = CODE_BLOCK_BODY_PADDING_Y * zoom;
        const gutterWidth = CODE_BLOCK_LINE_NUMBER_WIDTH * zoom;
        const fontSize = CODE_BLOCK_FONT_SIZE * zoom;
        const headerHeight = CODE_BLOCK_HEADER_HEIGHT * zoom;
        const bodyHeight = Math.max(0, height - headerHeight - (CODE_BLOCK_BORDER_ALLOWANCE * zoom));
        const lineHeight = CODE_BLOCK_LINE_HEIGHT * zoom;

        const update = (patch: Partial<CanvasCodeBlockData>) => {
          onUpdate(element.id, { ...block, ...patch });
        };

        const finishEditing = () => {
          if (!block.languageLocked) update({ language: detectCodeLanguage(block.code) });
          onEditingChange(null);
        };

        const revealOutput = () => {
          setCollapsedOutputIds((current) => {
            if (!current.has(element.id)) return current;
            const next = new Set(current);
            next.delete(element.id);
            return next;
          });
        };

        const startRun = () => {
          revealOutput();
          onRun(element.id, block);
        };

        const clearOutput = () => {
          setCollapsedOutputIds((current) => {
            if (!current.has(element.id)) return current;
            const next = new Set(current);
            next.delete(element.id);
            return next;
          });
          onClearRun(element.id);
        };

        const outputCollapsed = collapsedOutputIds.has(element.id);
        const outputContentId = "code-output-" + element.id;

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
            <section
              className={editing ? "pointer-events-auto overflow-hidden rounded-[6px]" : "overflow-hidden rounded-[6px]"}
              style={{
                width,
                height,
                background: palette.background,
                color: palette.foreground,
                border: `1px solid ${selected ? "var(--accent)" : palette.border}`,
                boxShadow: selected ? "0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)" : "none",
              }}
              data-canvas-code-block={element.id}
              aria-label={`Code block, ${effectiveLanguage}`}
            >
              <CanvasCodeBlockHeader
                elementId={element.id}
                block={block}
                language={effectiveLanguage}
                selected={selected}
                runnable={runnable}
                run={run}
                height={headerHeight}
                fontSize={fontSize}
                palette={palette}
                onRun={startRun}
                onStop={() => onStop(element.id)}
              />
              <div className="relative min-h-0 overflow-hidden" style={{ height: bodyHeight }}>
                <div
                  className="min-h-full min-w-0 overflow-x-hidden"
                  style={{
                    paddingTop: paddingY,
                    paddingBottom: paddingY,
                    transform: "translateY(var(--code-scroll-y, 0px))",
                  }}
                  aria-label={editing ? "Live syntax preview" : undefined}
                >
                  <HighlightedCodeLines
                    code={block.code}
                    language={effectiveLanguage}
                    resolvedTheme={resolvedTheme}
                    foreground={palette.foreground}
                    muted={palette.muted}
                    lineNumbers={block.lineNumbers}
                    zoom={zoom}
                    gutterWidth={gutterWidth}
                    paddingX={paddingX}
                    fontSize={fontSize}
                    lineHeight={lineHeight}
                  />
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
                        if (runnable) startRun();
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
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium" role="status" aria-live="polite">{runStatusLabel(run)}</span>
                  {selected && (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="grid size-7 place-items-center rounded-md transition-[color,background-color,transform] duration-100 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.97]"
                        aria-label={outputCollapsed ? "Expand code output" : "Collapse code output"}
                        aria-expanded={!outputCollapsed}
                        aria-controls={outputContentId}
                        title={outputCollapsed ? "Expand code output" : "Collapse code output"}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCollapsedOutputIds((current) => {
                            const next = new Set(current);
                            if (outputCollapsed) next.delete(element.id);
                            else next.add(element.id);
                            return next;
                          });
                        }}
                      >
                        {outputCollapsed
                          ? <ChevronDown className="size-3.5" aria-hidden="true" />
                          : <ChevronUp className="size-3.5" aria-hidden="true" />}
                      </button>
                      {run.status !== "running" && (
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded-md transition-[color,background-color,transform] duration-100 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.97]"
                          aria-label="Clear code output"
                          title="Clear code output"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            clearOutput();
                          }}
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <div id={outputContentId} className="mt-1" data-code-output-content hidden={outputCollapsed}>
                  {run.stdout.map((line, index) => <div key={`out-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{line}</div>)}
                  {run.stderr.map((line, index) => <div key={`err-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: resolvedTheme === "dark" ? "#ff6b68" : "#b91c1c" }}>{line}</div>)}
                  {"result" in run && run.result !== undefined && <div className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]"><span style={{ color: palette.muted }}>↳ </span>{run.result}</div>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
