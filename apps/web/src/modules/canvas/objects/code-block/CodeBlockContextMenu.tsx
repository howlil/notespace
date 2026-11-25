import {
  Check,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Moon,
  Play,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { SearchInput, Switch, cn } from "../../../../shared/ui";
import {
  MenuActionRow,
  MenuDivider,
  MenuSectionHeader,
  SubmenuItem,
  rowClass,
  segmentedBtnClass,
} from "../../selection/ContextMenuPrimitives";
import {
  codeLanguageOptions,
  detectCodeLanguage,
  effectiveCanvasCodeLanguage,
  resolveCodeTheme,
  type CanvasCodeBlockData,
} from "./model/canvas-code-block";
import { CodeLanguageIcon } from "./CodeLanguageIcon";
import { canRunCanvasCode } from "./model/canvas-code-runner";
import { canPreviewHtml } from "./preview/can-preview-html";

export type CanvasContextMenuCodeProps = {
  block: CanvasCodeBlockData;
  appDark: boolean;
  outputVisible: boolean;
  wordWrap: boolean;
  running: boolean;
  previewing: boolean;
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

function CodeLanguageSubmenuContent({ block, onChoose }: { block: CanvasCodeBlockData; onChoose: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const language = effectiveCanvasCodeLanguage(block);
  const filtered = codeLanguageOptions.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase()));
  const groups = [
    { label: "Executable", options: filtered.filter(([value]) => canRunCanvasCode(value)) },
    { label: "HTML preview", options: filtered.filter(([value]) => canPreviewHtml(value)) },
    { label: "Source / highlighting", options: filtered.filter(([value]) => !canRunCanvasCode(value) && !canPreviewHtml(value)) },
  ];
  return (
    <div className="flex max-h-[300px] flex-col">
      <SearchInput
        autoFocus
        aria-label="Search code languages"
        placeholder="Search languages"
        value={query}
        onChange={setQuery}
        containerClassName="mb-1 shrink-0"
        className="bg-canvas"
      />
      <div className="min-h-0 overflow-y-auto overscroll-contain no-scrollbar">
        <button type="button" className={cn(rowClass, !block.languageLocked && "bg-tint text-accent")} onClick={() => onChoose("auto")}>
          <CodeLanguageIcon language="auto" />
          <span className="flex-1 truncate">Auto / Detect</span>
          {!block.languageLocked && <Check className="size-3.5 shrink-0" />}
        </button>
        {groups.map((group) => group.options.length > 0 && (
          <div key={group.label} role="group" aria-label={group.label}>
            <div className="px-2 pt-2 pb-1 text-[10px] font-medium text-muted">{group.label}</div>
            {group.options.map(([value, label]) => {
              const active = block.languageLocked && language === value;
              return (
                <button key={value} type="button" className={cn(rowClass, active && "bg-tint text-accent")} onClick={() => onChoose(value)}>
                  <CodeLanguageIcon language={value} />
                  <span className="flex-1 truncate">{label}</span>
                  {active && <Check className="size-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        ))}
        {!filtered.length && <p className="p-2 text-[11px] text-muted">No matching languages</p>}
      </div>
    </div>
  );
}

export function CodeBlockContextMenu({ code, openSub, setOpenSub, onClose }: {
  code: CanvasContextMenuCodeProps;
  openSub: string | null;
  setOpenSub: (id: string | null) => void;
  onClose: () => void;
}) {
  const { block } = code;
  const language = effectiveCanvasCodeLanguage(block);
  const languageLabel = codeLanguageOptions.find(([value]) => value === language)?.[1] ?? language;
  const previewable = canPreviewHtml(language);
  const runnable = canRunCanvasCode(language);
  const dark = resolveCodeTheme(block.theme, code.appDark) === "dark";
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      window.setTimeout(onClose, 180);
    } catch {
      onClose();
    }
  };

  return (
    <>
      <div className="grid gap-1.5 px-1.5 pt-1 pb-1.5" onMouseEnter={() => setOpenSub(null)}>
        <MenuSectionHeader title="Code block" meta={languageLabel} />
        <div className="grid grid-cols-2 gap-1">
          {previewable ? (
            <button
              type="button"
              className={cn(
                segmentedBtnClass,
                code.previewing
                  ? "border-accent bg-tint text-accent"
                  : "border-transparent bg-button text-button-text hover:opacity-90",
              )}
              onClick={() => { code.onTogglePreview(); onClose(); }}
            >
              {code.previewing ? <Square className="size-3" /> : <Play className="size-3" />}
              <span>{code.previewing ? "Hide preview" : "Preview"}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!runnable}
              title={runnable ? (code.running ? "Stop JavaScript" : "Run JavaScript") : "Source only; execution is available for JavaScript"}
              className={cn(
                segmentedBtnClass,
                code.running
                  ? "border-accent bg-tint text-accent"
                  : "border-transparent bg-button text-button-text hover:opacity-90",
              )}
              onClick={() => { if (code.running) code.onStop(); else code.onRun(); onClose(); }}
            >
              {code.running ? <Square className="size-3" /> : <Play className="size-3" />}
              <span>{code.running ? "Stop" : "Run"}</span>
            </button>
          )}
          <button
            type="button"
            className={cn(
              segmentedBtnClass,
              code.outputVisible
                ? "border-accent bg-tint text-accent"
                : "border-line bg-canvas text-ink hover:bg-tint hover:text-accent",
            )}
            onClick={() => { code.onToggleOutput(); onClose(); }}
          >
            {code.outputVisible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            <span>{code.outputVisible ? "Hide output" : "Output"}</span>
          </button>
        </div>
      </div>

      <MenuDivider />

      <SubmenuItem
        id="code-language"
        openId={openSub}
        icon={<CodeLanguageIcon language={language} className="size-3.5" />}
        label="Language"
        valueLabel={languageLabel}
        panelClassName="w-60"
        onOpen={setOpenSub}
      >
        <CodeLanguageSubmenuContent
          block={block}
          onChoose={(value) => {
            code.onUpdate(value === "auto"
              ? { ...block, language: detectCodeLanguage(block.code), languageLocked: false }
              : { ...block, language: value, languageLocked: true });
            setOpenSub(null);
          }}
        />
      </SubmenuItem>

      <SubmenuItem
        id="code-appearance"
        openId={openSub}
        icon={<SlidersHorizontal className="size-3.5" />}
        label="Appearance"
        panelClassName="w-56"
        onOpen={setOpenSub}
      >
        <div className="grid gap-0.5">
          <div role="group" aria-label="Code theme" className="flex min-h-8 items-center gap-1 px-2 text-[12px]">
            <span className="mr-auto text-ink">Theme</span>
            <button
              type="button"
              className={cn("rounded-md px-1.5 py-0.5 text-[11px] text-muted hover:bg-tint hover:text-accent", block.theme === "auto" && "bg-tint text-accent")}
              onClick={() => code.onUpdate({ ...block, theme: "auto" })}
            >
              Auto
            </button>
            <Switch
              size="sm"
              checked={dark}
              aria-label="Dark code theme"
              thumbIcon={dark ? <Moon className="size-2.5" /> : <Sun className="size-2.5" />}
              onCheckedChange={(next) => code.onUpdate({ ...block, theme: next ? "dark" : "light" })}
            />
          </div>
          <MenuActionRow
            icon={block.lineNumbers ? <Check className="size-3.5 text-accent" /> : null}
            label="Line numbers"
            active={block.lineNumbers}
            onClick={() => code.onUpdate({ ...block, lineNumbers: !block.lineNumbers })}
          />
          <MenuActionRow
            icon={code.wordWrap ? <Check className="size-3.5 text-accent" /> : null}
            label="Word wrap"
            active={code.wordWrap}
            onClick={code.onToggleWrap}
          />
          <MenuActionRow
            icon={block.heightMode === "auto" ? <Check className="size-3.5 text-accent" /> : null}
            label="Fit to content / Auto height"
            active={block.heightMode === "auto"}
            onClick={code.onFitContent}
          />
        </div>
      </SubmenuItem>

      <MenuDivider />

      <MenuActionRow
        icon={copied ? <Check className="size-3.5 text-accent" /> : <Clipboard className="size-3.5" />}
        label={copied ? "Copied" : "Copy code"}
        onHover={() => setOpenSub(null)}
        onClick={() => void copyCode()}
      />
      <MenuActionRow
        icon={<Copy className="size-3.5" />}
        label="Duplicate"
        shortcut="Ctrl+D"
        onHover={() => setOpenSub(null)}
        onClick={() => { code.onDuplicate(); onClose(); }}
      />

      <MenuDivider />

      <MenuActionRow
        icon={<Trash2 className="size-3.5 text-danger" />}
        label="Delete code block"
        shortcut="Del"
        danger
        onHover={() => setOpenSub(null)}
        onClick={() => { code.onDelete(); onClose(); }}
      />
    </>
  );
}
