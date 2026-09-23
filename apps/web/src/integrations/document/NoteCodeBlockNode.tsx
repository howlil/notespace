import type { NodeViewProps } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Check, Clipboard, Code2, Moon, Play, Square, Sun, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  codeLanguageLabel,
  codeLanguageOptions,
  codeLowlight,
  detectCodeLanguage,
  normalizeCodeLanguage,
} from "../../domain/code/code-language";
import {
  codeThemeSurface,
  codeThemeTitle,
  codeThemeVariables,
  nextCodeTheme,
  resolveCodeTheme,
  type CodeBlockTheme,
} from "../../domain/code/code-theme";
import { useTheme } from "../../app/providers/theme-provider";
import { canRunCode } from "../code/code-runner";
import { useCodeRunner, type CodeRunView } from "../code/use-code-runner";

function runStatusLabel(run: CodeRunView) {
  if (run.status === "running") return "Running";
  if (run.status === "success") return `Done · ${run.durationMs} ms`;
  if (run.status === "timeout") return `Timed out · ${run.durationMs} ms`;
  if (run.status === "cancelled") return `Stopped · ${run.durationMs} ms`;
  return `Error · ${run.durationMs} ms`;
}

function NoteCodeBlockNodeView({ node, updateAttributes, getPos }: NodeViewProps) {
  const { dark } = useTheme();
  const code = node.textContent;
  const theme: CodeBlockTheme = node.attrs.theme === "dark" || node.attrs.theme === "light" ? node.attrs.theme : "auto";
  const resolvedTheme = resolveCodeTheme(theme, dark);
  const palette = codeThemeSurface(resolvedTheme);
  const themeStyle = {
    ...codeThemeVariables(resolvedTheme),
    background: palette.background,
    color: palette.foreground,
    borderColor: palette.border,
  } as CSSProperties;
  const explicitLanguage = typeof node.attrs.language === "string" && node.attrs.language.trim()
    ? normalizeCodeLanguage(node.attrs.language)
    : "";
  const effectiveLanguage = explicitLanguage || detectCodeLanguage(code);
  const position = getPos();
  const blockId = typeof node.attrs.blockId === "string" && node.attrs.blockId
    ? node.attrs.blockId
    : `note-code-${typeof position === "number" ? position : "unknown"}`;
  const liveIds = useMemo(() => [blockId], [blockId]);
  const { runs, runBlock, stopRun, clearRun } = useCodeRunner(liveIds);
  const run = runs[blockId];
  const signature = `${code}\u0000${effectiveLanguage}`;
  const lastSignature = useRef(signature);
  const [copied, setCopied] = useState(false);
  const runnable = canRunCode(effectiveLanguage);

  useEffect(() => {
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;
    clearRun(blockId);
  }, [blockId, clearRun, signature]);

  return (
    <NodeViewWrapper
      as="div"
      data-note-code-block={blockId}
      data-code-language={effectiveLanguage}
      className="notespace-code-theme my-3 overflow-hidden rounded-lg border"
      style={themeStyle}
      onKeyDownCapture={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
        const target = event.target;
        if (!(target instanceof Element) || !target.closest("[data-note-code-source]")) return;
        if (!runnable) return;
        event.preventDefault();
        event.stopPropagation();
        runBlock(blockId, { code, language: effectiveLanguage });
      }}
    >
      <div
        contentEditable={false}
        className="flex min-h-9 items-center gap-1 border-b px-1.5 py-1"
        style={{ background: palette.toolbar, borderColor: palette.border, color: palette.foreground }}
      >
        <Code2 className="ml-1 size-3.5 shrink-0 text-muted" strokeWidth={1.5} aria-hidden="true" />
        <select
          aria-label="Code language"
          value={explicitLanguage || "auto"}
          className="h-7 min-w-[132px] max-w-[180px] rounded-md border bg-transparent px-2 text-[10px] outline-none focus:border-accent"
          onChange={(event) => {
            const value = event.target.value;
            updateAttributes({ language: value === "auto" ? null : value });
          }}
        >
          <option value="auto">Auto · {codeLanguageLabel(effectiveLanguage)}</option>
          {codeLanguageOptions.filter(([value]) => value !== "plaintext").map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
          <option value="plaintext">Plain text</option>
        </select>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-[var(--code-muted)] hover:bg-black/5 hover:text-[var(--code-fg)] focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={codeThemeTitle(theme, dark)}
            title={codeThemeTitle(theme, dark)}
            onClick={() => updateAttributes({ theme: nextCodeTheme(theme) })}
          >
            {resolvedTheme === "dark"
              ? <Moon className="size-3.5" />
              : <Sun className="size-3.5" />}
          </button>
          {runnable && (
            <button
              type="button"
              className="grid size-7 place-items-center rounded-md text-muted hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
              aria-label={run?.status === "running" ? "Stop JavaScript" : "Run JavaScript"}
              title={run?.status === "running" ? "Stop JavaScript" : "Run JavaScript"}
              onClick={() => {
                if (run?.status === "running") stopRun(blockId);
                else runBlock(blockId, { code, language: effectiveLanguage });
              }}
            >
              {run?.status === "running"
                ? <Square className="size-3" fill="currentColor" />
                : <Play className="size-3.5" fill="currentColor" />}
            </button>
          )}
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={copied ? "Code copied" : "Copy code"}
            title={copied ? "Code copied" : "Copy code"}
            onClick={() => {
              void navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              });
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
          </button>
        </div>
      </div>

      <div className="m-0 overflow-hidden rounded-none border-0 p-0">
        <NodeViewContent
          data-note-code-source=""
          aria-label="Edit code block"
          spellCheck={false}
          className="block min-h-10 whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-[1.7] text-[var(--code-fg)] outline-none [overflow-wrap:anywhere]"
        />
      </div>

      {run && (
        <div
          contentEditable={false}
          className="max-h-40 overflow-auto border-t px-3 py-2 font-mono text-[10px] leading-4"
          aria-label="Code output"
          style={{ background: palette.toolbar, borderColor: palette.border, color: palette.foreground }}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium">{runStatusLabel(run)}</span>
            {run.status !== "running" && (
              <button
                type="button"
                className="grid size-5 place-items-center rounded text-muted hover:bg-tint hover:text-ink"
                aria-label="Clear code output"
                onClick={() => clearRun(blockId)}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          {run.stdout.map((line, index) => (
            <div key={`out-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{line}</div>
          ))}
          {run.stderr.map((line, index) => (
            <div key={`err-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: palette.error }}>{line}</div>
          ))}
          {"result" in run && run.result !== undefined && (
            <div className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
              <span className="text-muted">↳ </span>{run.result}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export function createNoteCodeBlockExtension() {
  return CodeBlockLowlight.extend({
    addAttributes() {
      return {
        ...(this.parent?.() ?? {}),
        theme: { default: "auto" },
      };
    },
    addNodeView() {
      return ReactNodeViewRenderer(NoteCodeBlockNodeView);
    },
  }).configure({
    lowlight: codeLowlight,
    enableTabIndentation: true,
    tabSize: 2,
  });
}
