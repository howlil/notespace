import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../class-names";

type InputVariant = "default" | "ghost";
type InputSize = "sm" | "md";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
  inputSize?: InputSize;
};

const variantClasses: Record<InputVariant, string> = {
  default: "rounded-md border border-line bg-surface px-2.5 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  ghost: "min-h-0 rounded-none border-0 bg-transparent px-0 py-0 focus:border-transparent focus-visible:outline-none",
};

const sizeClasses: Record<InputSize, string> = {
  sm: "h-7 min-h-0 text-sm",
  md: "min-h-8 text-sm",
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { variant = "default", inputSize = "md", className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full min-w-0 text-ink outline-none placeholder:text-muted",
        sizeClasses[inputSize],
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
