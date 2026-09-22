import { forwardRef, type CSSProperties } from "react";
import { Play } from "lucide-react";
import { PopupSurface, cn } from "../../components/ui";
import type { ActivityType } from "../../domain/activity/api";

export const activityTypeOptions: Array<{ value: ActivityType; label: string }> = [
  { value: "build", label: "Build" },
  { value: "learn", label: "Learn" },
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "exercise", label: "Exercise" },
  { value: "other", label: "Other" },
];

export const ActivityTypeMenu = forwardRef<HTMLDivElement, {
  className?: string;
  style?: CSSProperties;
  onSelect: (activityType: ActivityType) => void;
}>(function ActivityTypeMenu({ className, style, onSelect }, ref) {
  return (
    <PopupSurface
      ref={ref}
      className={cn("z-25 w-[176px] p-1.5", className)}
      style={style}
      role="menu"
      aria-label="Choose activity type"
    >
      <div className="px-2 py-1.5 text-[9px] font-medium uppercase tracking-[.08em] text-muted">
        Activity type
      </div>
      {activityTypeOptions.map((item) => (
        <button
          key={item.value}
          type="button"
          role="menuitem"
          className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] text-ink hover:bg-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => onSelect(item.value)}
        >
          <Play size={13} className="text-muted" aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </PopupSurface>
  );
});
