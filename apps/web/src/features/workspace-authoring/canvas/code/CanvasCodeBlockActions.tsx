import { Check, ChevronDown, Clipboard, Copy, Eye, EyeOff, MoreHorizontal, Moon, Play, Square, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../../shared/ui";
import { useAnchoredPanelPosition } from "../../../../shared/ui/overlays/anchored-panel";
import { useExclusivePopup } from "../../../../shared/ui/overlays/dismissable";
import { codeLanguageOptions, detectCodeLanguage, effectiveCanvasCodeLanguage as effectiveLanguage, resolveCodeTheme, type CanvasCodeBlockData } from "./canvas-code-block";
import { canRunCanvasCode } from "./canvas-code-runner";
import { canPreviewHtml } from "./preview/can-preview-html";

const control = "flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-[11px] text-muted hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
const row = "flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[11px] hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent";

type CodeActionsProps = {
  block: CanvasCodeBlockData;
  appDark: boolean;
  suppressed: boolean;
  outputVisible: boolean;
  wordWrap: boolean;
  running: boolean;
  previewing: boolean;
  onExitEditing: () => void;
  onUpdate: (block: CanvasCodeBlockData) => void;
  onFitContent: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleOutput: () => void;
  onTogglePreview: () => void;
  onToggleWrap: () => void;
  onRun: () => void;
  onStop: () => void;
};

function languageTitle(block: CanvasCodeBlockData) {
  const language = effectiveLanguage(block);
  return codeLanguageOptions.find(([value]) => value === language)?.[1] ?? language;
}

function CodeRunAction({ block, running, previewing, onRun, onStop, onTogglePreview }: Pick<CodeActionsProps, "block" | "running" | "previewing" | "onRun" | "onStop" | "onTogglePreview">) {
  const language = effectiveLanguage(block);
  if (canPreviewHtml(language)) {
    const label = previewing ? "Hide HTML preview" : "Preview HTML";
    return (
      <button type="button" className={cn(control, previewing && "bg-tint text-accent")} title={label} aria-label={label} aria-pressed={previewing} onClick={onTogglePreview}>
        {previewing ? <Square className="size-4" /> : <Play className="size-4" />}
      </button>
    );
  }
  const runnable = canRunCanvasCode(language);
  const unavailable = "Source only; execution is available for JavaScript";
  const label = running ? "Stop JavaScript" : "Run JavaScript";
  return (
    <span className="shrink-0" title={runnable ? label : unavailable}>
      <button type="button" className={control} disabled={!runnable} title={runnable ? label : unavailable}
        aria-label={runnable ? label : unavailable} onClick={running ? onStop : onRun}>
        {running ? <Square className="size-4" /> : <Play className="size-4" />}
      </button>
    </span>
  );
}

function CodeOutputAction({ outputVisible, onToggleOutput }: Pick<CodeActionsProps, "outputVisible" | "onToggleOutput">) {
  const label = outputVisible ? "Hide code output" : "Show code output";
  return <button type="button" className={cn(control, outputVisible && "bg-tint text-accent")} title={label} aria-label={label} aria-pressed={outputVisible} onClick={onToggleOutput}>
    {outputVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
  </button>;
}

function CodeCopyAction({ code }: { code: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => setStatus("idle"), [code]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setStatus("copied"); }
    catch { setStatus("failed"); }
  };
  const message = status === "failed" ? "Copy failed; select and copy the source" : "Code copied";
  return <>
    <button type="button" className={control} aria-label="Copy code" title={status === "failed" ? message : "Copy code"} onClick={() => void copy()}>
      {status === "copied" ? <Check className="size-4" /> : <Clipboard className="size-4" />}
    </button>
    <span role="status" className="sr-only">{status === "idle" ? "" : message}</span>
  </>;
}

function CodeLanguagePopup({ block, onChoose }: { block: CanvasCodeBlockData; onChoose: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const language = effectiveLanguage(block);
  const filtered = codeLanguageOptions.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase()));
  const groups = [
    { label: "Executable", options: filtered.filter(([value]) => canRunCanvasCode(value)) },
    { label: "HTML preview", options: filtered.filter(([value]) => canPreviewHtml(value)) },
    { label: "Source / highlighting", options: filtered.filter(([value]) => !canRunCanvasCode(value) && !canPreviewHtml(value)) },
  ];
  return <>
    <input autoFocus aria-label="Search code languages" placeholder="Search languages" value={query} onChange={(event) => setQuery(event.target.value)} className="m-1 h-8 shrink-0 rounded-md border border-line bg-canvas px-2 text-[11px] outline-accent" />
    <div className="min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" className={row} aria-pressed={!block.languageLocked} onClick={() => onChoose("auto")}>Auto / Detect language{!block.languageLocked && <Check className="size-4" />}</button>
      {groups.map((group) => group.options.length > 0 && <div key={group.label} role="group" aria-label={group.label}>
        <div className="px-2 py-2 text-[10px] text-muted">{group.label}</div>
        {group.options.map(([value, label]) => {
          const active = block.languageLocked && language === value;
          return <button key={value} type="button" className={cn(row, active && "bg-tint text-accent")} aria-pressed={active} onClick={() => onChoose(value)}>{label}{active && <Check className="size-4" />}</button>;
        })}
      </div>)}
      {!filtered.length && <p className="p-2 text-[11px] text-muted">No matching languages</p>}
    </div>
  </>;
}

function CodeThemeControl({ block, appDark, onUpdate }: Pick<CodeActionsProps, "block" | "appDark" | "onUpdate">) {
  const dark = resolveCodeTheme(block.theme, appDark) === "dark";
  return <div role="group" aria-label="Code theme" className="flex min-h-8 items-center gap-1 px-2 text-[11px]">
    <span className="mr-auto">Theme</span>
    <button type="button" className={cn(control, block.theme === "auto" && "bg-tint text-accent")} aria-label="Code theme auto" aria-pressed={block.theme === "auto"} title="Follow app theme" onClick={() => onUpdate({ ...block, theme: "auto" })}>Auto</button>
    <button type="button" role="switch" aria-label="Dark code theme" aria-checked={dark} title={`${dark ? "Dark" : "Light"} theme${block.theme === "auto" ? " (Auto)" : ""}`}
      className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent"
      onClick={() => onUpdate({ ...block, theme: dark ? "light" : "dark" })}>
      <span aria-hidden="true" className={cn("inline-flex h-5 w-9 items-center rounded-full p-0.5", dark ? "bg-accent" : "bg-line")}>
        <span className={cn("grid size-4 place-items-center rounded-full bg-surface text-accent transition-transform duration-100 motion-reduce:transition-none", dark && "translate-x-4")}>
          {dark ? <Moon className="size-3" /> : <Sun className="size-3" />}
        </span>
      </span>
    </button>
  </div>;
}

function CodeMoreActions({ actions, close }: { actions: CodeActionsProps; close: () => void }) {
  const { block, onUpdate } = actions;
  return <div className="overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <CodeThemeControl block={block} appDark={actions.appDark} onUpdate={onUpdate} />
    <button type="button" className={row} aria-pressed={block.lineNumbers} onClick={() => onUpdate({ ...block, lineNumbers: !block.lineNumbers })}>Line numbers{block.lineNumbers && <Check className="size-4" />}</button>
    <button type="button" className={row} aria-pressed={actions.wordWrap} onClick={actions.onToggleWrap}>Word wrap{actions.wordWrap && <Check className="size-4" />}</button>
    <button type="button" className={row} aria-label="Fit code height" aria-pressed={block.heightMode === "auto"} onClick={actions.onFitContent}>Fit to content / Auto height{block.heightMode === "auto" && <Check className="size-4" />}</button>
    <button type="button" className={row} onClick={() => { close(); actions.onDuplicate(); }}><span>Duplicate code block</span><Copy className="size-4" /></button>
    <button type="button" className={cn(row, "text-danger")} onClick={() => { close(); actions.onDelete(); }}>Delete code block</button>
  </div>;
}

export function CanvasCodeBlockActions(actions: CodeActionsProps) {
  const { block, suppressed } = actions;
  const [popup, setPopup] = useState<"language" | "more" | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const languageRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = popup === "language" ? languageRef : moreRef;
  const close = useCallback(() => setPopup(null), []);
  useExclusivePopup(popup !== null, close);
  const position = useAnchoredPanelPosition(anchorRef, panelRef, popup !== null, 256, 320, { horizontalAlignment: "start" });
  const panelStyle = position ? { top: position.top, left: position.left } : { top: 8, left: 8 };

  useEffect(() => {
    if (!popup) return;
    panelRef.current?.querySelector<HTMLElement>("input,button")?.focus({ preventScroll: true });
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !toolbarRef.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      anchorRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchorRef, close, popup]);
  useEffect(() => { if (suppressed) close(); }, [close, suppressed]);

  const chooseLanguage = (value: string) => {
    actions.onUpdate(value === "auto"
      ? { ...block, language: detectCodeLanguage(block.code), languageLocked: false }
      : { ...block, language: value, languageLocked: true });
    close();
    languageRef.current?.focus({ preventScroll: true });
  };
  return (
    <div ref={toolbarRef} data-code-toolbar className="notespace-selection-actions pointer-events-auto relative z-[1] flex h-10 max-w-full items-center gap-1 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&~_.excalidraw_.mobile-shape-actions]:!hidden"
      role="toolbar" aria-label="Code block settings" onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); actions.onExitEditing(); } }}>
      <button ref={languageRef} type="button" className={cn(control, "min-w-0")} style={{ flexShrink: 1 }} title={`${languageTitle(block)}${block.languageLocked ? "" : " (Auto)"}`} aria-label="Code language" aria-haspopup="dialog" aria-expanded={popup === "language"} onClick={() => setPopup(popup === "language" ? null : "language")}>
        <span className="truncate">{languageTitle(block)}</span><ChevronDown className="size-3.5 shrink-0" />
      </button>
      <CodeOutputAction outputVisible={actions.outputVisible} onToggleOutput={actions.onToggleOutput} />
      <CodeRunAction block={block} running={actions.running} previewing={actions.previewing} onRun={actions.onRun} onStop={actions.onStop} onTogglePreview={actions.onTogglePreview} />
      <CodeCopyAction code={block.code} />
      <button ref={moreRef} type="button" className={control} title="More code actions" aria-label="More code actions" aria-haspopup="dialog" aria-expanded={popup === "more"} onClick={() => setPopup(popup === "more" ? null : "more")}><MoreHorizontal className="size-4" /></button>
      {popup && !suppressed && createPortal(
        <div ref={panelRef} data-code-toolbar-popup role="dialog" aria-label={popup === "language" ? "Code language" : "More code actions"}
          className={cn("fixed z-[1000] flex max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg border border-line bg-surface p-1 text-ink shadow-none", popup === "language" ? "w-64" : "w-56")}
          style={{ ...panelStyle, maxHeight: "min(320px, calc(100dvh - 16px))", visibility: position ? "visible" : "hidden" }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input,button"));
            const index = items.indexOf(document.activeElement as HTMLElement);
            items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}>
          {popup === "language" ? <CodeLanguagePopup block={block} onChoose={chooseLanguage} /> : <CodeMoreActions actions={actions} close={close} />}
        </div>, document.body,
      )}
    </div>
  );
}
