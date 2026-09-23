import { type HTMLAttributes } from "react";
import { cn } from "./utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" className={cn("block animate-soft-pulse rounded-md bg-tint motion-reduce:animate-none", className)} {...props} />;
}
