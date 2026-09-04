import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--button)] text-[var(--button-text)] hover:opacity-90",
  secondary: "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--accent)] hover:bg-[var(--tint)]",
  ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--tint)] hover:text-[var(--ink)]",
  danger: "bg-[var(--danger)] text-white hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-7 rounded-md px-2.5 text-[11px]",
  md: "min-h-8 rounded-md px-3 text-[11px]",
  icon: "size-8 rounded-md p-0",
};

export function Button({
  asChild = false,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Props) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      className={cn(
        "inline-flex items-center justify-center gap-1.5 border font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-wait disabled:opacity-50",
        variants[variant],
        sizes[size],
        variant === "secondary" ? "border" : "border-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function IconButton({
  className,
  variant = "ghost",
  ...props
}: Omit<Props, "size">) {
  return <Button {...props} size="icon" variant={variant} className={className} />;
}
