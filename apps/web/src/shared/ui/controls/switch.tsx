import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../class-names";

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "aria-checked"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: "sm" | "md";
  thumbIcon?: ReactNode;
};

export function Switch({
  checked,
  onCheckedChange,
  size = "sm",
  thumbIcon,
  className,
  disabled,
  ...props
}: SwitchProps) {
  const isSmall = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        isSmall ? "h-7 w-9" : "h-8 w-10",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center rounded-full p-0.5 transition-colors duration-100",
          isSmall ? "h-4 w-8" : "h-5 w-9",
          checked ? "bg-accent" : "bg-line",
        )}
      >
        <span
          className={cn(
            "grid place-items-center rounded-full bg-surface text-accent transition-transform duration-100 motion-reduce:transition-none",
            isSmall ? "size-3" : "size-4",
            checked && "translate-x-4",
          )}
        >
          {thumbIcon}
        </span>
      </span>
    </button>
  );
}
