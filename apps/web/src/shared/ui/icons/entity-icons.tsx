import { cn } from "../class-names";

type IconProps = {
  className?: string;
  size?: number;
};

/** Consistent glyph representing a Workspace / Whiteboard Canvas entity across tabs, recent items, and maps. */
export function WorkspaceEntityIcon({ className, size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect x="1.75" y="2.5" width="12.5" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.35" />
      <rect x="4" y="5" width="3.5" height="2.75" rx="0.8" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.1" />
      <rect x="8.75" y="8" width="3.25" height="3" rx="0.8" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7.5 6.4H9.6C10.05 6.4 10.4 6.75 10.4 7.2V8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

/** Consistent glyph representing an atomic Markdown Card entity across tabs, recent items, and library views. */
export function CardEntityIcon({ className, size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect x="2.5" y="1.75" width="11" height="12.5" rx="2.4" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5 5.25H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 8.25H10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.72" />
      <path d="M5 10.75H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.72" />
    </svg>
  );
}

/** Apple-inspired rounded squircle emblem for top-level Workspace Map navigation. */
export function WorkspaceMapAppIcon({ className, active = false }: { className?: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-[6px] border transition-colors",
        active
          ? "border-accent/40 bg-accent text-button-text"
          : "border-line bg-surface text-ink",
        className,
      )}
      aria-hidden="true"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect
          x="2"
          y="2.5"
          width="5.2"
          height="4.4"
          rx="1.3"
          fill="currentColor"
          fillOpacity={active ? "0.28" : "0.14"}
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <rect
          x="8.8"
          y="9.1"
          width="5.2"
          height="4.4"
          rx="1.3"
          fill="currentColor"
          fillOpacity={active ? "0.28" : "0.14"}
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <rect
          x="9.5"
          y="2.8"
          width="4"
          height="3.2"
          rx="1"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.1"
        />
        <path
          d="M7.2 4.7H8.1C8.8 4.7 9.2 5.1 9.2 5.8V7.8C9.2 8.4 8.8 8.8 8.2 8.8H7.5C6.8 8.8 6.4 9.2 6.4 9.9V11.3H8.8"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Apple-inspired rounded squircle emblem for top-level Card Library navigation. */
export function CardsAppIcon({ className, active = false }: { className?: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-[6px] border transition-colors",
        active
          ? "border-accent/40 bg-accent text-button-text"
          : "border-line bg-surface text-ink",
        className,
      )}
      aria-hidden="true"
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect
          x="4.5"
          y="2"
          width="8.5"
          height="10.2"
          rx="1.8"
          fill="currentColor"
          fillOpacity={active ? "0.16" : "0.08"}
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="1.1"
        />
        <rect
          x="2.8"
          y="3.8"
          width="8.8"
          height="10.2"
          rx="1.9"
          fill={active ? "var(--accent)" : "var(--surface)"}
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <path d="M4.8 6.7H9.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M4.8 9.1H9" stroke="currentColor" strokeOpacity="0.72" strokeWidth="1.15" strokeLinecap="round" />
        <path d="M4.8 11.2H7.6" stroke="currentColor" strokeOpacity="0.72" strokeWidth="1.15" strokeLinecap="round" />
      </svg>
    </span>
  );
}
