import { Check } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { cn } from "../class-names";
import { Kbd } from "../primitives/kbd";
import { SectionLabel } from "../primitives/section-label";

export const menuRowClass =
  "group flex min-h-7 w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-ink transition-colors hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40";

export const menuSegmentedBtnClass =
  "flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-3.5";

export function MenuSection({
  label,
  meta,
  className,
  children,
}: {
  label: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("mt-1 grid gap-0.5 border-t border-line/80 pt-1.5 first:mt-0 first:border-t-0 first:pt-0", className)}
      aria-label={label}
    >
      <SectionLabel title={label} meta={meta} className="px-2 pt-0.5 pb-1" />
      {children}
    </section>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-line/80" role="separator" />;
}

export function MenuItem({
  icon,
  label,
  shortcut,
  checked,
  active,
  danger,
  disabled,
  title,
  role = "menuitem",
  buttonRef,
  className,
  onClick,
  onHover,
}: {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  checked?: boolean;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  role?: "menuitem" | "button";
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  onClick: () => void;
  onHover?: () => void;
}) {
  const isActive = active ?? checked;
  return (
    <button
      ref={buttonRef}
      type="button"
      role={role === "button" ? undefined : role}
      disabled={disabled}
      title={title}
      aria-pressed={checked !== undefined ? checked : undefined}
      className={cn(
        menuRowClass,
        isActive && "bg-tint text-accent",
        danger && "text-danger hover:bg-danger/10 hover:text-danger",
        className,
      )}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      {icon !== undefined && (
        <span
          className={cn(
            "grid size-3.5 shrink-0 place-items-center transition-colors [&_svg]:size-3.5",
            danger ? "text-danger/85 group-hover:text-danger" : isActive ? "text-accent" : "text-muted group-hover:text-accent",
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <Kbd tone={danger ? "danger" : "default"} className="ml-2">{shortcut}</Kbd>}
      {checked && <Check size={14} strokeWidth={2} className="shrink-0 text-accent" aria-hidden="true" />}
    </button>
  );
}
