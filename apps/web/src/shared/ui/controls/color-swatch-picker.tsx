import { cn } from "../class-names";

export type ColorSwatchOption = {
  value: string;
  label?: string;
};

function TransparentSlash() {
  return <span className="absolute inset-[3px] rotate-45 border-t border-danger" aria-hidden="true" />;
}

export function ColorSwatchPicker({
  colors,
  value,
  onChange,
  label,
  columns = 6,
  allowCustom = true,
  customLabel,
  customStyle = "inline-swatch",
  className,
}: {
  colors: readonly (string | ColorSwatchOption)[];
  value: string | undefined;
  onChange: (color: string) => void;
  label: string;
  columns?: 5 | 6;
  allowCustom?: boolean;
  customLabel?: string;
  customStyle?: "inline-swatch" | "row";
  className?: string;
}) {
  const options: ColorSwatchOption[] = colors.map((item) =>
    typeof item === "string" ? { value: item, label: item === "transparent" ? "Transparent" : item } : item,
  );
  const customHex = value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#ffffff";
  const isCustomActive = Boolean(
    value && value !== "transparent" && !options.some((option) => option.value.toLowerCase() === value.toLowerCase()),
  );
  const customTitle = customLabel ?? `Custom ${label.toLowerCase()}`;

  return (
    <div className={cn("grid gap-2", className)}>
      <div
        className={cn("grid w-full gap-1.5", columns === 5 ? "grid-cols-5" : "grid-cols-6")}
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const active = value?.toLowerCase() === option.value.toLowerCase();
          const optionLabel = option.label ?? option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "relative grid h-6 w-full place-items-center rounded-md border border-black/10 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent",
                active && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
              )}
              style={{ backgroundColor: option.value === "transparent" ? "var(--surface)" : option.value }}
              aria-label={`${label}: ${optionLabel}`}
              aria-pressed={active}
              title={optionLabel}
              onClick={() => onChange(option.value)}
            >
              {option.value === "transparent" && <TransparentSlash />}
            </button>
          );
        })}
        {allowCustom && customStyle === "inline-swatch" && (
          <label
            className={cn(
              "relative grid h-6 w-full cursor-pointer place-items-center overflow-hidden rounded-md border border-black/15 transition-transform hover:scale-105",
              isCustomActive && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
            )}
            style={{
              background: isCustomActive
                ? customHex
                : "conic-gradient(from 180deg at 50% 50%, #ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)",
            }}
            title={customTitle}
          >
            <span className="sr-only">{customTitle}</span>
            <input
              type="color"
              value={customHex}
              aria-label={customTitle}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
        )}
      </div>
      {allowCustom && customStyle === "row" && (
        <label className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/80 bg-background/60 px-2.5 py-1.5 transition-colors hover:border-accent/35 hover:bg-tint/40">
          <span className="text-xs text-ink/85">{customTitle}</span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-2xs uppercase text-muted">{customHex}</span>
            <span
              className="relative size-4 shrink-0 overflow-hidden rounded border border-black/15 shadow-xs"
              style={{ backgroundColor: customHex }}
            >
              <input
                type="color"
                value={customHex}
                aria-label={customTitle}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                onChange={(event) => onChange(event.target.value)}
              />
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
