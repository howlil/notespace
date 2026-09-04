import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "min-h-8 w-full min-w-0 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-0",
          className,
        )}
        {...props}
      />
    );
  },
);
