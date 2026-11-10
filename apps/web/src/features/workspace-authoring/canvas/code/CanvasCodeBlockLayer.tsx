import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type WheelEvent } from "react";
import {
  codeThemeSurface, codeTokenColor, detectCodeLanguage, effectiveCanvasCodeLanguage, highlightCodeLines,
  readCanvasCodeBlock, resolveCodeTheme, type CanvasCodeBlockData,
} from "./canvas-code-block";
import {
  CODE_BLOCK_BORDER_ALLOWANCE, codeBlockIntersectsViewport, codeBlockOutputLayout,
  CODE_BLOCK_BODY_PADDING_X, CODE_BLOCK_BODY_PADDING_Y, CODE_BLOCK_FONT_SIZE,
  CODE_BLOCK_LINE_HEIGHT, CODE_BLOCK_LINE_NUMBER_WIDTH,
} from "./canvas-code-block-layout";
import { CanvasCodeBlockMeasure } from "./CanvasCodeBlockMeasure";
import { canRunCanvasCode } from "./canvas-code-runner";
import type { CodeRunView } from "./execution/use-code-runner";

export type CodeBlockViewOptions = { showOutput: boolean; wordWrap: boolean; fitRevision?: number };
export const defaultCodeBlockView: CodeBlockViewOptions = { showOutput: false, wordWrap: true };
type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };

function codeOutputMessage(run: CodeRunView | undefined, runnable: boolean) {
  if (!run) return runnable ? "Run JavaScript to see output" : "Source only; execution is available for JavaScript";
  const messages = {
    running: "Running…",
    timeout: "Execution timed out. Run again to retry.",
    cancelled: "Execution stopped. Run again to retry.",
    error: "Execution failed. Edit the source and run again.",
  };
  if (run.status !== "success") return messages[run.status];
  return !run.stdout.length && !run.stderr.length && run.result === undefined ? "Completed without output" : null;
}

function containPaneWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
}

function containPaneNavigation(event: KeyboardEvent) {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) event.stopPropagation();
}

function CodeOutput({ run, runnable, compact }: { run?: CodeRunView; runnable: boolean; compact: boolean }) {
  const message = codeOutputMessage(run, runnable);
  return (
    <div className={`h-full min-h-0 min-w-0 overflow-auto overscroll-contain whitespace-pre-wrap ${compact ? "px-1" : "p-2"} [overflow-wrap:anywhere] [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`} role="region" tabIndex={0} aria-label="Code output" onWheel={containPaneWheel} onKeyDown={containPaneNavigation}>
      {message && <div role="status" aria-live="polite" className="text-muted">{message}</div>}
      {run && <CodeRunContent run={run} />}
    </div>
  );
}

function CodeRunContent({ run }: { run: CodeRunView }) {
  return <>
    {run.stdout.map((line, index) => <div key={`out-${index}`}>{line}</div>)}
    {run.stderr.map((line, index) => <div key={`err-${index}`} className="text-danger">{line}</div>)}
    {"result" in run && run.result !== undefined && <div>{run.result}</div>}
  </>;
}

type InitialCodeMeasurement = { code: string; width: number; lineNumbers: boolean; height: number };

function matchesInitialMeasurement(baseline: InitialCodeMeasurement | undefined, element: OrderedExcalidrawElement, block: CanvasCodeBlockData) {
  return baseline?.code === block.code && baseline.width === element.width && baseline.lineNumbers === block.lineNumbers;
}

export function CanvasCodeBlockLayer({
  elements, viewport, appDark, selectedElementId, editingElementId, runs, views,
  onUpdate, onEditingChange, onRun, onAutoFit,
}: {
  elements: readonly OrderedExcalidrawElement[];
  viewport: CanvasViewport;
  appDark: boolean;
  selectedElementId: string | null;
  editingElementId: string | null;
  runs: Record<string, CodeRunView>;
  views: Record<string, CodeBlockViewOptions>;
  onUpdate: (elementId: string, block: CanvasCodeBlockData) => void;
  onEditingChange: (elementId: string | null) => void;
  onRun: (elementId: string, block: CanvasCodeBlockData) => void;
  onAutoFit: (elementId: string, height: number) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [layerSize, setLayerSize] = useState({ width: 0, height: 0 });
  // Removing chrome must not resize existing auto-height snapshots on opening.
  const initialMeasurements = useRef(new Map(elements.flatMap((element) => {
    const block = readCanvasCodeBlock(element);
    return block ? [[element.id, { code: block.code, width: element.width, lineNumbers: block.lineNumbers, height: element.height }] as const] : [];
  })));
  const codeElements = elements.filter((element) => !element.isDeleted)
    .flatMap((element) => { const block = readCanvasCodeBlock(element); return block ? [{ element, block }] : []; });
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || typeof ResizeObserver === "undefined") return;
    const measure = () => setLayerSize({ width: layer.clientWidth, height: layer.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);
  const visibleElements = codeElements.filter(({ element }) => codeBlockIntersectsViewport({
    ...element, ...viewport, viewportWidth: layerSize.width, viewportHeight: layerSize.height,
  }));
  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Canvas code blocks">
      {codeElements.map(({ element, block }) => {
        if (block.heightMode !== "auto") return null;
        const baseline = initialMeasurements.current.get(element.id);
        const fitRevision = views[element.id]?.fitRevision ?? 0;
        const wordWrap = views[element.id]?.wordWrap ?? true;
        const preserveHeight = wordWrap && fitRevision === 0 && matchesInitialMeasurement(baseline, element, block) ? baseline?.height : undefined;
        return <CanvasCodeBlockMeasure key={`measure-${element.id}`} code={block.code} width={element.width} lineNumbers={block.lineNumbers} wordWrap={wordWrap} fitRevision={fitRevision} preserveHeight={preserveHeight} onHeight={(height) => { if (preserveHeight === undefined) initialMeasurements.current.delete(element.id); onAutoFit(element.id, height); }} />;
      })}
      {visibleElements.map(({ element, block }) => <CodeCard key={element.id} element={element} block={block} viewport={viewport} appDark={appDark}
        selected={selectedElementId === element.id} editing={editingElementId === element.id}
        run={runs[element.id]} view={views[element.id] ?? defaultCodeBlockView}
        onUpdate={(next) => onUpdate(element.id, next)} onEditingChange={onEditingChange} onRun={() => onRun(element.id, block)} />)}
    </div>
  );
}

type CodeCardProps = {
  element: OrderedExcalidrawElement; block: CanvasCodeBlockData; viewport: CanvasViewport;
  appDark: boolean; selected: boolean; editing: boolean; run?: CodeRunView; view: CodeBlockViewOptions;
  onUpdate: (block: CanvasCodeBlockData) => void; onEditingChange: (id: string | null) => void; onRun: () => void;
};

function codeCardMetrics(element: OrderedExcalidrawElement, viewport: CanvasViewport, view: CodeBlockViewOptions) {
  const zoom = viewport.zoom;
  const width = Math.max(1, element.width * zoom);
  const height = Math.max(1, element.height * zoom);
  const layout = codeBlockOutputLayout(width);
  const compactOutput = view.showOutput && layout === "stack" && element.height < 70;
  return {
    width, height, layout, compactOutput, zoom,
    paddingX: CODE_BLOCK_BODY_PADDING_X * zoom,
    paddingY: compactOutput ? 0 : CODE_BLOCK_BODY_PADDING_Y * zoom,
    gutterWidth: CODE_BLOCK_LINE_NUMBER_WIDTH * zoom,
    fontSize: CODE_BLOCK_FONT_SIZE * zoom,
    lineHeight: (compactOutput ? 14 : CODE_BLOCK_LINE_HEIGHT) * zoom,
    columns: view.showOutput && layout === "split" ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)",
    rows: view.showOutput && layout === "stack" ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)",
    sourceHeight: view.showOutput ? undefined : Math.max(0, height - CODE_BLOCK_BORDER_ALLOWANCE * zoom),
  };
}

type CodeCardMetrics = ReturnType<typeof codeCardMetrics>;

function CodeCard(props: CodeCardProps) {
  const { element, block, viewport, appDark, selected, editing, run, view } = props;
  const resolvedTheme = resolveCodeTheme(block.theme, appDark);
  const palette = codeThemeSurface(resolvedTheme);
  const language = effectiveCanvasCodeLanguage(block);
  const metrics = codeCardMetrics(element, viewport, view);
  const { width, height, fontSize, lineHeight, layout } = metrics;
  return (
    <section data-canvas-code-block={element.id} aria-label={`Code block, ${language}`} data-output-layout={view.showOutput ? layout : undefined}
      className="absolute overflow-hidden rounded-md"
      style={{ left: (element.x + viewport.scrollX) * viewport.zoom, top: (element.y + viewport.scrollY) * viewport.zoom,
        width, height, transform: `rotate(${element.angle}rad)`, transformOrigin: "center",
        fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace', fontSize, lineHeight: `${lineHeight}px`,
        background: palette.background, color: palette.foreground, border: `1px solid ${selected ? "var(--accent)" : palette.border}`,
        display: "grid", gridTemplateColumns: metrics.columns, gridTemplateRows: metrics.rows }}>
      <CodeSource block={block} language={language} resolvedTheme={resolvedTheme} metrics={metrics} selected={selected} editing={editing} wordWrap={view.wordWrap}
        onUpdate={props.onUpdate} onFinishEditing={() => props.onEditingChange(null)} onRun={props.onRun} />
      {view.showOutput && <div className={selected ? "pointer-events-auto min-h-0 min-w-0" : "min-h-0 min-w-0"}
        style={{ borderLeft: layout === "split" ? `1px solid ${palette.border}` : undefined, borderTop: layout === "stack" ? `1px solid ${palette.border}` : undefined }}
        onPointerDown={(event) => event.stopPropagation()}><CodeOutput run={run} runnable={canRunCanvasCode(language)} compact={metrics.compactOutput} /></div>}
    </section>
  );
}

function CodeSource({ block, language, resolvedTheme, metrics, selected, editing, wordWrap, onUpdate, onFinishEditing, onRun }: {
  block: CanvasCodeBlockData; language: string; resolvedTheme: "light" | "dark"; metrics: CodeCardMetrics; selected: boolean; editing: boolean; wordWrap: boolean;
  onUpdate: (block: CanvasCodeBlockData) => void; onFinishEditing: () => void; onRun: () => void;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    const editor = source.querySelector("textarea");
    if (editor) {
      editor.scrollTop = source.scrollTop;
      editor.scrollLeft = source.scrollLeft;
      source.style.setProperty("--code-scroll-y", `${-editor.scrollTop}px`);
      source.style.setProperty("--code-scroll-x", `${-editor.scrollLeft}px`);
    } else {
      source.style.removeProperty("--code-scroll-y");
      source.style.removeProperty("--code-scroll-x");
    }
    source.scrollTop = source.scrollLeft = 0;
  }, [editing]);
  const palette = codeThemeSurface(resolvedTheme);
  const lines = useMemo(() => highlightCodeLines(block.code, language), [block.code, language]);
  const { paddingX, paddingY, gutterWidth, fontSize, lineHeight, zoom } = metrics;
  const whitespace = wordWrap ? "whitespace-pre-wrap [overflow-wrap:anywhere]" : "whitespace-pre";
  const updateSource = (code: string) => onUpdate({ ...block, code, ...(!block.languageLocked ? { language: detectCodeLanguage(code) } : {}) });
  return <div ref={sourceRef} role="region" aria-label="Code source" tabIndex={selected && !editing ? 0 : -1}
    onPointerDown={(event) => event.stopPropagation()} onWheel={containPaneWheel} onKeyDown={containPaneNavigation}
    className={`relative min-h-0 min-w-0 overscroll-contain [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${editing ? "overflow-hidden" : "overflow-auto"} ${selected ? "pointer-events-auto" : ""}`} style={{ height: metrics.sourceHeight }}>
    <div className="min-h-full min-w-0" style={{ paddingTop: paddingY, paddingBottom: paddingY, transform: "translate(var(--code-scroll-x, 0px), var(--code-scroll-y, 0px))" }} aria-label={editing ? "Live syntax preview" : undefined}>
      {lines.map((tokens, index) => <div key={index} className="grid min-w-0" style={{ gridTemplateColumns: block.lineNumbers ? `${gutterWidth}px minmax(0,1fr)` : "minmax(0,1fr)" }}>
        {block.lineNumbers && <span className="select-none text-right" aria-hidden="true" style={{ color: palette.muted, paddingRight: 6 * zoom }}>{index + 1}</span>}
        <code className={`block min-w-0 ${whitespace}`} aria-label={index === 0 ? "Highlighted code" : undefined} style={{ paddingLeft: paddingX, paddingRight: paddingX }}>
          {tokens.map((token, tokenIndex) => <span key={tokenIndex} style={{ color: codeTokenColor(token.classes, resolvedTheme) }}>{token.text}</span>)}{!tokens.length ? "\u200b" : null}
        </code>
      </div>)}
    </div>
    {editing && <textarea autoFocus wrap={wordWrap ? "soft" : "off"} spellCheck={false} value={block.code} aria-label="Edit code block"
      className={`absolute inset-0 h-full w-full resize-none border-0 bg-transparent font-[inherit] outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${whitespace}`}
      style={{ boxSizing: "border-box", color: "transparent", caretColor: palette.foreground, WebkitTextFillColor: "transparent", tabSize: 2,
        paddingTop: paddingY, paddingBottom: paddingY, paddingLeft: (block.lineNumbers ? gutterWidth : 0) + paddingX, paddingRight: paddingX, fontSize, lineHeight: `${lineHeight}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      onScroll={(event) => {
        event.currentTarget.parentElement?.style.setProperty("--code-scroll-y", `${-event.currentTarget.scrollTop}px`);
        event.currentTarget.parentElement?.style.setProperty("--code-scroll-x", `${-event.currentTarget.scrollLeft}px`);
      }}
      onChange={(event) => updateSource(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onFinishEditing(); }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); if (canRunCanvasCode(language)) onRun(); }
        if (event.key === "Tab") {
          event.preventDefault();
          const target = event.currentTarget, start = target.selectionStart, end = target.selectionEnd;
          updateSource(`${block.code.slice(0, start)}  ${block.code.slice(end)}`);
          requestAnimationFrame(() => { target.selectionStart = target.selectionEnd = start + 2; });
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest("[data-code-toolbar], [data-code-toolbar-popup]")) return;
        event.currentTarget.parentElement?.style.setProperty("--code-scroll-y", "0px");
        event.currentTarget.parentElement?.style.setProperty("--code-scroll-x", "0px");
        onFinishEditing();
      }} />}
  </div>;
}
