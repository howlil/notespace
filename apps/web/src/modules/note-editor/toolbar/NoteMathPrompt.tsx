import { Button, Input } from "../../../shared/ui";
import type { MathPromptState } from "./editor-positioning";

export function NoteMathPrompt({
  prompt,
  onChange,
  onSubmit,
  onCancel,
}: {
  prompt: MathPromptState;
  onChange: (patch: Partial<MathPromptState>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isEditing = prompt.pos !== undefined;
  return (
    <div
      className="notespace-note-ui absolute z-[var(--z-popover)] grid min-w-56 gap-1.5 rounded-lg border border-line bg-surface p-2 [box-shadow:var(--shadow-popup)]"
      style={{ left: prompt.position.left, top: prompt.position.top }}
      role="dialog"
      aria-label={isEditing ? "Edit Math formula" : "Insert Math formula"}
    >
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          inputSize="sm"
          className="h-6 flex-1 rounded bg-canvas px-1.5 font-mono text-xs"
          value={prompt.latex}
          onChange={(event) => onChange({ latex: event.target.value, error: null })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder="e.g. x^2 + y^2 = z^2"
          aria-label="LaTeX formula"
        />
        <button
          type="button"
          className={"rounded border px-1.5 py-0.5 text-2xs " + (prompt.block ? "border-accent bg-tint text-accent" : "border-line text-muted hover:text-ink")}
          aria-pressed={prompt.block}
          onClick={() => onChange({ block: !prompt.block, error: null })}
        >
          Block
        </button>
      </div>
      {prompt.error && (
        <p className="m-0 text-2xs text-danger" role="alert">{prompt.error}</p>
      )}
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="xs" className="h-auto px-2 py-0.5 text-2xs" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="primary" size="xs" className="h-auto bg-accent px-2 py-0.5 text-2xs text-surface" onClick={onSubmit}>{isEditing ? "Update" : "Insert"}</Button>
      </div>
    </div>
  );
}
