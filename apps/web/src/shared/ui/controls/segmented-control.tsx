import type { ReactNode } from "react";
import { cn } from "../class-names";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "pills",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "pills" | "tabs" | "buttons";
  disabled?: boolean;
  className?: string;
  "aria-label": string;
}) {
  return (
    <div
      role={variant === "tabs" ? "tablist" : "group"}
      aria-label={ariaLabel}
      className={cn(
        variant === "buttons" ? "grid gap-1" : "inline-flex items-center gap-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        const roleProps = variant === "tabs"
          ? { role: "tab" as const, "aria-selected": active }
          : { "aria-pressed": active };

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            title={option.title}
            {...roleProps}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
              variant === "pills" && "min-h-7 rounded-full border px-2.5 text-xs",
              variant === "tabs" && "h-6 shrink-0 rounded-md px-2 text-xs",
              variant === "buttons" && "h-7 rounded-lg border px-2 text-xs",
              active
                ? "border-accent bg-tint text-accent"
                : variant === "buttons"
                  ? "border-line bg-canvas text-ink hover:bg-tint hover:text-accent"
                  : "border-transparent text-muted hover:bg-tint hover:text-ink",
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
