import { Check, Clipboard, Code2, Moon, Pencil, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { cn } from "../../components/ui";
import {
  codeLanguageOptions,
  codeThemeSurface,
  codeTokenColor,
  detectCodeLanguage,
  highlightCode,
  readCanvasCodeBlock,
  resolveCodeTheme,
  type CanvasCodeBlockData,
  type CodeBlockTheme,
} from "./canvas-code-block";

type CanvasViewport = {
  zoom: number;
  scrollX: number;
  scrollY: number;
};

type CodeElement = OrderedExcalidrawElement & {
  customData?: Record<string, unknown>;
};

function languageLabel(language: string) {
  return codeLanguageOptions.find(([value]) => value === language)?.[1] ?? language;
}

function nextTheme(theme: CodeBlockTheme): CodeBlockTheme {
  if (theme === "auto") return "dark";
  if (theme === "dark") return "light";
  return "auto";
}

function themeTitle(theme: CodeBlockTheme) {
  if (theme === "auto") return "Theme follows Notespace";
  if (theme === "dark") return "JetBrains Darcula";
  return "IntelliJ Light";
}

function ThemeIcon({ resolved }: { resolved: "light" | "dark" }) {
  return resolved === "dark" ? <Moon size={12} /> : <Sun size={12} />;
}

export function CanvasCodeBlockLayer({
  elements,
  viewport,
  appDark,
  selectedElementId,
  onUpdate,
}: {
  elements: readonly OrderedExcalidrawElement[];
  viewport: CanvasViewport;
  appDark: boolean;
  selectedElementId: string | null;
  onUpdate: (elementId: string, block: CanvasCodeBlockData) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const codeElements = useMemo(
    () => elements
      .filter((element) => !element.isDeleted)
      .map((element) => ({ element: element as CodeElement, block: readCanvasCodeBlock(element as CodeElement) }))
      .filter((entry): entry is { element: CodeElement; block: CanvasCodeBlockData } => entry.block !== null),
    [elements],
  );

  useEffect(() => {
    if (editingId && !codeElements.some(({ element }) => element.id === editingId)) setEditingId(null);
  }, [codeElements, editingId]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-label="Canvas code blocks">
      {codeElements.map(({ element, block }) => {
        const resolvedTheme = resolveCodeTheme(block.theme, appDark);
        const palette = codeThemeSurface(resolvedTheme);
        const selected = selectedElementId === element.id;
        const editing = editingId === element.id;
        const zoom = viewport.zoom;
        const left = (element.x + viewport.scrollX) * zoom;
        const top = (element.y + viewport.scrollY) * zoom;
        const width = Math.max(1, element.width * zoom);
        const height = Math.max(1, element.height * zoom);
        const tokens = highlightCode(block.code, block.language);
        const lineCount = Math.max(1, block.code.split("\n").length);

        const update = (patch: Partial<CanvasCodeBlockData>) => {
          const next = { ...block, ...patch };
          onUpdate(element.id, next);
        };

        return (
          <section
            key={element.id}
            className={cn("absolute overflow-hidden rounded-[6px]", editing && "pointer-events-auto")}
            style={{
              left,
              top,
              width,
              height,
              transform: `rotate(${element.angle}rad)`,
              transformOrigin: "center",
              background: palette.background,
              color: palette.foreground,
              border: `1px solid ${selected ? "#4f7396" : palette.border}`,
              boxShadow: selected ? "0 0 0 1px color-mix(in srgb, #4f7396 35%, transparent)" : "none",
              fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
            }}
            data-canvas-code-block={element.id}
            aria-label={`Code block, ${languageLabel(block.language)}`}
          >
            <header
              className={cn("flex h-7 items-center gap-1 border-b px-2 text-[10px]", selected && "pointer-events-auto")}
              style={{ background: palette.toolbar, borderColor: palette.border }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {selected ? (
                <>
                  <Code2 size={12} aria-hidden="true" />
                  <select
                    className="min-w-0 max-w-28 flex-1 bg-transparent text-[10px] outline-none"
                    value={block.languageLocked ? block.language : "auto"}
                    aria-label="Code language"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "auto") {
                        update({ language: detectCodeLanguage(block.code), languageLocked: false });
                      } else {
                        update({ language: value, languageLocked: true });
                      }
                    }}
                  >
                    <option value="auto">Auto · {languageLabel(block.language)}</option>
                    {codeLanguageOptions.filter(([value]) => value !== "plaintext").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    <option value="plaintext">Plain text</option>
                  </select>
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded hover:bg-black/10"
                    title={themeTitle(block.theme)}
                    aria-label={themeTitle(block.theme)}
                    onClick={() => update({ theme: nextTheme(block.theme) })}
                  >
                    <ThemeIcon resolved={resolvedTheme} />
                  </button>
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded hover:bg-black/10"
                    title={editing ? "Finish editing" : "Edit code"}
                    aria-label={editing ? "Finish editing" : "Edit code"}
                    onClick={() => {
                      if (editing && !block.languageLocked) update({ language: detectCodeLanguage(block.code) });
                      setEditingId(editing ? null : element.id);
                    }}
                  >
                    {editing ? <Check size={12} /> : <Pencil size={12} />}
                  </button>
                  <button
                    type="button"
                    className="grid size-5 place-items-center rounded hover:bg-black/10"
                    title="Copy code"
                    aria-label="Copy code"
                    onClick={() => {
                      void navigator.clipboard.writeText(block.code).then(() => {
                        setCopiedId(element.id);
                        window.setTimeout(() => setCopiedId((current) => current === element.id ? null : current), 1200);
                      });
                    }}
                  >
                    {copiedId === element.id ? <Check size={12} /> : <Clipboard size={12} />}
                  </button>
                </>
              ) : (
                <span className="truncate font-medium">{languageLabel(block.language)}</span>
              )}
            </header>

            <div className="relative h-[calc(100%-28px)] overflow-auto text-[11px] leading-[1.55]">
              {editing ? (
                <textarea
                  autoFocus
                  spellCheck={false}
                  value={block.code}
                  aria-label="Edit code block"
                  className="h-full w-full resize-none border-0 bg-transparent p-2 font-[inherit] text-[11px] leading-[1.55] outline-none"
                  style={{ color: palette.foreground, tabSize: 2 }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      if (!block.languageLocked) update({ language: detectCodeLanguage(block.code) });
                      setEditingId(null);
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
                  onBlur={() => {
                    if (!block.languageLocked) update({ language: detectCodeLanguage(block.code) });
                  }}
                />
              ) : (
                <div className="flex min-h-full">
                  {block.lineNumbers && (
                    <div className="select-none border-r px-2 py-2 text-right" style={{ color: palette.muted, borderColor: palette.border }}>
                      {Array.from({ length: lineCount }, (_, index) => <div key={index}>{index + 1}</div>)}
                    </div>
                  )}
                  <pre className="m-0 min-w-0 flex-1 overflow-visible p-2 font-[inherit] whitespace-pre" aria-label="Highlighted code">
                    <code>
                      {tokens.map((token, index) => (
                        <span key={index} style={{ color: codeTokenColor(token.classes, resolvedTheme) }}>{token.text}</span>
                      ))}
                    </code>
                  </pre>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
