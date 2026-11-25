import type { HTMLAttributes } from "react";
import { cn } from "../class-names";

type BadgeVariant = "neutral" | "outline" | "accent" | "subtle" | "danger";

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "bg-tint text-muted",
  outline: "border border-line bg-canvas text-muted",
  accent: "bg-tint text-accent",
  subtle: "border border-line bg-background/70 text-muted",
  danger: "bg-danger/10 text-danger",
};

export function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums",
        badgeVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
