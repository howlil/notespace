import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "../../../../shared/ui";

type GridColumns = 2 | 3 | 4 | 5;
const optionGridClass: Record<GridColumns, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5" };

export function Choice({ label, active, children, onClick }: { label: string; active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border border-transparent bg-canvas text-ink transition-[color,background-color,border-color,transform] duration-100 hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.97] [&_svg]:size-4",
        active && "border-accent bg-tint text-accent ring-1 ring-accent/15",
      )}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Section({ label, mixed, children }: { label: string; mixed?: boolean; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={label}>
      <h3 className="m-0 flex items-center justify-between gap-3 text-[10px] font-medium text-muted">{label}{mixed && <span className="font-normal">Mixed</span>}</h3>
      {children}
    </section>
  );
}

export function OptionGrid({ columns, children }: { columns: GridColumns; children: ReactNode }) {
  return <div className={cn("grid w-fit gap-1", optionGridClass[columns])}>{children}</div>;
}

export function OpacityControl({ value, onChange }: { value: number | undefined; onChange: (value: number) => void }) {
  return (
    <div className="flex w-[104px] items-center gap-2">
      <input
        type="range"
        min="0"
        max="100"
        value={value ?? 100}
        aria-valuetext={value === undefined ? "Mixed" : `${value}%`}
        aria-label="Opacity"
        className="h-1.5 w-16 shrink-0 accent-accent"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output className="w-8 shrink-0 rounded-md border border-line bg-canvas px-1 py-1 text-center text-[9px] tabular-nums text-muted">
        {value === undefined ? "Mixed" : `${Math.round(value)}%`}
      </output>
    </div>
  );
}

export function CompactButton({ label, open, children, onClick }: { label: string; open?: boolean; children: ReactNode; onClick: MouseEventHandler<HTMLButtonElement> }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-100 hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96] [&_svg]:size-4",
        open && "bg-tint text-accent ring-1 ring-accent/15",
      )}
      aria-label={label}
      aria-expanded={open}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TransparentMark() {
  return <span className="absolute inset-[3px] rotate-45 border-t border-danger" aria-hidden="true" />;
}

function ColorChip({ color, sizeClass = "size-4" }: { color: string; sizeClass?: string }) {
  return (
    <span
      className={cn("relative block rounded-[4px] border border-line", sizeClass)}
      style={{ backgroundColor: color === "transparent" ? "var(--surface)" : color }}
      aria-hidden="true"
    >
      {color === "transparent" && <TransparentMark />}
    </span>
  );
}

export function ColorTrigger({ strokeColor, fillColor, showStroke, showFill, open, onClick }: {
  strokeColor?: string;
  fillColor?: string;
  showStroke: boolean;
  showFill: boolean;
  open: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <CompactButton label="Colors" open={open} onClick={onClick}>
      <span className="relative block size-5" aria-hidden="true">
        {showStroke && <span className="absolute top-0 left-0 grid size-4 place-items-center rounded-full border border-line text-[9px] text-muted" style={{ backgroundColor: strokeColor ?? "var(--surface)" }}>{strokeColor === undefined ? "—" : null}</span>}
        {showFill && <span className="absolute right-0 bottom-0">{fillColor === undefined ? <span className="grid size-3.5 place-items-center rounded-full border border-line bg-surface text-[9px]">—</span> : <ColorChip color={fillColor} sizeClass="size-[14px]" />}</span>}
      </span>
    </CompactButton>
  );
}

export function ColorSwatches({ colors, current, label, onChange }: {
  colors: readonly string[];
  current: string | undefined;
  label: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="grid w-fit grid-cols-6 gap-1" role="group" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "grid size-7 place-items-center rounded-md border border-transparent hover:bg-tint focus-visible:outline-2 focus-visible:outline-accent",
            current?.toLowerCase() === color.toLowerCase() && "border-accent bg-tint ring-1 ring-accent/15",
          )}
          aria-label={`${label}: ${color === "transparent" ? "Transparent" : color}`}
          aria-pressed={current?.toLowerCase() === color.toLowerCase()}
          title={color === "transparent" ? "Transparent" : color}
          onClick={() => onChange(color)}
        >
          <ColorChip color={color} sizeClass="size-5" />
        </button>
      ))}
      <label className="grid size-7 cursor-pointer place-items-center rounded-md border border-line bg-canvas hover:bg-tint" title={`Custom ${label.toLowerCase()}`}>
        <span className="sr-only">Custom {label.toLowerCase()}</span>
        <input
          type="color"
          value={current && /^#[0-9a-f]{6}$/i.test(current) ? current : "#ffffff"}
          aria-label={`Custom ${label.toLowerCase()}`}
          className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
