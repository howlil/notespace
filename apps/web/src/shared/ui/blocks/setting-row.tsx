import type { ReactNode } from "react";
import { cn } from "../class-names";
import { Badge } from "../primitives/badge";
import { SectionLabel } from "../primitives/section-label";

export function SettingSection({
  title,
  count,
  countAriaLabel,
  aside,
  className,
  "aria-label": ariaLabel,
  children,
}: {
  title: string;
  count?: ReactNode;
  countAriaLabel?: string;
  aside?: ReactNode;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={ariaLabel ?? title} className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SectionLabel title={title} />
          {count !== undefined && (
            <Badge variant="neutral" aria-label={countAriaLabel}>
              {count}
            </Badge>
          )}
        </div>
        {aside && <span className="text-xs text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function SettingRow({
  title,
  description,
  icon,
  control,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  control?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {icon && <span className="mt-0.5 shrink-0 text-accent">{icon}</span>}
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-medium text-ink">{title}</p>
          {description && <p className="mt-0.5 mb-0 text-xs leading-4 text-muted">{description}</p>}
        </div>
      </div>
      {control && <div className="shrink-0">{control}</div>}
    </div>
  );
}
