import { Search, X } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../class-names";
import { Input } from "./input";

type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  variant?: "bordered" | "flush";
  clearable?: boolean;
  onClear?: () => void;
  rightSlot?: ReactNode;
  containerClassName?: string;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    variant = "bordered",
    clearable = false,
    onClear,
    rightSlot,
    containerClassName,
    className,
    ...props
  },
  ref,
) {
  if (variant === "flush") {
    return (
      <div className={cn("flex min-h-10 items-center gap-2 border-b border-line/80 px-3", containerClassName)}>
        <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
        <Input
          ref={ref}
          variant="ghost"
          className={cn("h-full min-h-0 flex-1 py-2 text-nav", className)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
        {clearable && value && (
          <button
            type="button"
            aria-label="Clear search"
            className="grid size-5 shrink-0 place-items-center rounded text-muted hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              onChange("");
              onClear?.();
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
        {rightSlot}
      </div>
    );
  }

  return (
    <div className={cn("relative", containerClassName)}>
      <Search size={13} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input
        ref={ref}
        inputSize="sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("pl-7", clearable && value ? "pr-7" : "pr-2.5", className)}
        {...props}
      />
      {clearable && value && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded text-muted hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
        >
          <X size={11} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
