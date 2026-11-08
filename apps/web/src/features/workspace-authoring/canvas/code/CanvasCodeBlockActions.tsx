import { Code2, ListOrdered, Maximize2, Moon, Sun, Trash2 } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../../../../shared/ui";
import {
  codeLanguageOptions,
  codeThemeTitle,
  detectCodeLanguage,
  nextCodeTheme,
  resolveCodeTheme,
  type CanvasCodeBlockData,
} from "./canvas-code-block";

function ActionButton({
  label,
  active,
  danger,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent",
        active && "bg-tint text-accent",
        danger && "hover:bg-danger/10 hover:text-danger",
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function CanvasCodeBlockActions({
  block,
  appDark,
  onUpdate,
  onFitContent,
  onDelete,
}: {
  block: CanvasCodeBlockData;
  appDark: boolean;
  onUpdate: (block: CanvasCodeBlockData) => void;
  onFitContent: () => void;
  onDelete: () => void;
}) {
  const resolvedTheme = resolveCodeTheme(block.theme, appDark);

  return (
    <div
      className="notespace-selection-actions pointer-events-auto relative z-[1] flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 shadow-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&~_.excalidraw_.mobile-shape-actions]:!hidden"
      role="toolbar"
      aria-label="Code block settings"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Code2 className="mx-1 size-4 shrink-0 text-muted" strokeWidth={1.5} aria-hidden="true" />
      <select
        className="h-8 min-w-[132px] max-w-[170px] shrink-0 rounded-md border border-line bg-canvas px-2 text-[10px] text-ink outline-none focus:border-accent"
        aria-label="Code language"
        value={block.languageLocked ? block.language : "auto"}
        onChange={(event) => {
          const value = event.target.value;
          onUpdate(value === "auto"
            ? { ...block, language: detectCodeLanguage(block.code), languageLocked: false }
            : { ...block, language: value, languageLocked: true });
        }}
      >
        <option value="auto">Auto · {codeLanguageOptions.find(([value]) => value === block.language)?.[1] ?? block.language}</option>
        {codeLanguageOptions.filter(([value]) => value !== "plaintext").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        <option value="plaintext">Plain text</option>
      </select>

      <ActionButton
        label={codeThemeTitle(block.theme, appDark)}
        onClick={() => onUpdate({ ...block, theme: nextCodeTheme(block.theme) })}
      >
        {resolvedTheme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
      </ActionButton>

      <ActionButton
        label={block.lineNumbers ? "Hide line numbers" : "Show line numbers"}
        active={block.lineNumbers}
        onClick={() => onUpdate({ ...block, lineNumbers: !block.lineNumbers })}
      >
        <ListOrdered className="size-3.5" />
      </ActionButton>

      <ActionButton label="Fit code height" active={block.heightMode === "auto"} onClick={onFitContent}>
        <Maximize2 className="size-3.5" />
      </ActionButton>
      <ActionButton label="Delete code block" danger onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </ActionButton>
    </div>
  );
}
