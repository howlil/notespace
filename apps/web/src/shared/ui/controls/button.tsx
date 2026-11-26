import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../class-names";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md" | "icon-xs" | "icon-sm" | "icon";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  children?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-button text-button-text hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:border-accent hover:bg-tint",
  ghost: "bg-transparent text-muted hover:bg-tint hover:text-ink",
  danger: "bg-danger text-danger-foreground hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  xs: "h-6 min-h-0 rounded-md px-2 text-xs",
  sm: "min-h-7 rounded-md px-2.5 text-sm",
  md: "min-h-8 rounded-md px-3 text-sm",
  "icon-xs": "size-6 min-h-0 rounded-md p-0",
  "icon-sm": "size-7 min-h-0 rounded-md p-0",
  icon: "size-8 rounded-md p-0",
};

function buttonClassName(variant: ButtonVariant, size: ButtonSize, active?: boolean, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 border font-medium transition-[color,background-color,border-color,opacity,filter,transform] duration-100 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
    active && variant === "ghost" ? "bg-tint text-accent hover:bg-tint" : variants[variant],
    sizes[size],
    variant === "secondary" ? "border" : "border-transparent",
    active && variant !== "ghost" && "bg-tint text-accent",
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { asChild = false, variant = "primary", size = "md", active = false, className, children, ...props },
  ref,
) {
  const classes = buttonClassName(variant, size, active, className);
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  );
});

const iconSizeMap: Record<"xs" | "sm" | "md", ButtonSize> = {
  xs: "icon-xs",
  sm: "icon-sm",
  md: "icon",
};

export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<Props, "size"> & { size?: "xs" | "sm" | "md" }
>(function IconButton({ className, variant = "ghost", size = "md", ...props }, ref) {
  return <Button ref={ref} {...props} size={iconSizeMap[size]} variant={variant} className={className} />;
});
