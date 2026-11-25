import type { HTMLAttributes } from "react";
import { cn } from "../class-names";

type KbdTone = "default" | "surface" | "danger";

const toneClasses: Record<KbdTone, string> = {
  default: "border-line/80 bg-background/70 text-muted",
  surface: "border-line bg-surface text-muted",
  danger: "border-danger/25 bg-danger/5 text-danger/80",
};

export function Kbd({
  tone = "default",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: KbdTone }) {
  return (
    <kbd
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-sans text-2xs leading-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
