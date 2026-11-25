import type { ReactNode } from "react";
import { cn } from "../class-names";

export function SectionLabel({
  title,
  meta,
  className,
}: {
  title: string;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-[0.06em] text-muted/80", className)}>
      <span>{title}</span>
      {meta !== undefined && meta !== null && (
        <span className="truncate font-mono text-2xs font-normal normal-case tracking-normal text-ink/70">
          {meta}
        </span>
      )}
    </div>
  );
}
