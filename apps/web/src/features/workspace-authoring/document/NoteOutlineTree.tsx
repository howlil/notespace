import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../shared/ui";
import { visibleNoteOutline, type NoteOutlineItem } from "./note-outline";

export function NoteOutlineTree({
  items,
  collapsed,
  activeId,
  onToggle,
  onSelect,
}: {
  items: NoteOutlineItem[];
  collapsed: ReadonlySet<string>;
  activeId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (!items.length) {
    return <p className="m-0 px-3 py-4 text-[11px] leading-5 text-muted">Add a heading to navigate this note.</p>;
  }

  return (
    <nav className="notespace-note-outline-scroll min-h-0 flex-1 overflow-y-auto py-1" aria-label="Note outline">
      {visibleNoteOutline(items, collapsed).map((item) => {
        const expanded = !collapsed.has(item.id);
        const active = activeId === item.id;
        return (
          <div
            key={item.id}
            className={cn("group mx-1.5 flex min-h-7 min-w-0 items-center rounded-md hover:bg-tint", active && "bg-tint")}
            style={{ paddingLeft: 2 + Math.min(5, Math.max(0, item.level - 1)) * 10 }}
          >
            {item.hasChildren ? (
              <button
                type="button"
                aria-label={`${expanded ? "Collapse" : "Expand"} ${item.text}`}
                aria-expanded={expanded}
                onClick={() => onToggle(item.id)}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
              </button>
            ) : <span className="block w-6 shrink-0" aria-hidden="true" />}
            <button
              type="button"
              className={cn(
                "min-h-7 min-w-0 flex-1 truncate rounded-md border-0 bg-transparent py-1 pr-1.5 text-left text-[11px] text-ink focus-visible:outline-2 focus-visible:outline-accent",
                item.level === 1 && "font-semibold",
                active && "font-semibold text-accent",
              )}
              aria-current={active ? "location" : undefined}
              title={item.text}
              onClick={() => onSelect(item.id)}
            >{item.text}</button>
          </div>
        );
      })}
    </nav>
  );
}
