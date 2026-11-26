import { createPortal } from "react-dom";
import { StickyNote } from "lucide-react";
import type { NoteSummary } from "../../platform/api/note-api";
import { Badge, Skeleton, cn } from "../../shared/ui";

export type NoteMentionAnchorRect = {
  top: number;
  left: number;
  bottom: number;
};

export type NoteMentionPopoverProps = {
  open: boolean;
  anchorRect: NoteMentionAnchorRect | null;
  query: string;
  notes: NoteSummary[];
  loading: boolean;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelectNote: (note: NoteSummary) => void;
};

const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 240;

function computePopoverPosition(rect: NoteMentionAnchorRect): { top: number; left: number } {
  if (typeof window === "undefined") {
    return { top: rect.bottom + 4, left: rect.left };
  }
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - POPOVER_WIDTH - margin);
  const left = Math.min(Math.max(margin, rect.left), maxLeft);
  const spaceBelow = window.innerHeight - rect.bottom - margin;
  const top = spaceBelow >= 160 || spaceBelow >= rect.top
    ? rect.bottom + 4
    : Math.max(margin, rect.top - POPOVER_MAX_HEIGHT - 4);
  return { top, left };
}

export function NoteMentionPopover({
  open,
  anchorRect,
  query,
  notes,
  loading,
  selectedIndex,
  onSelectedIndexChange,
  onSelectNote,
}: NoteMentionPopoverProps) {
  if (!open || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const pos = computePopoverPosition(anchorRect);

  return createPortal(
    <div
      role="listbox"
      aria-label="Link to Note"
      data-note-mention-popover=""
      className="fixed z-[var(--z-popover)] w-[280px] max-h-[240px] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface p-1 text-ink no-scrollbar [box-shadow:var(--shadow-float)]"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center justify-between px-2 py-1 text-2xs font-medium text-muted">
        <span>Link Note</span>
        {query.trim() && <span className="truncate max-w-[140px]">“{query.trim()}”</span>}
      </div>

      {loading && notes.length === 0 ? (
        <div className="grid gap-1 p-1" role="status" aria-live="polite" aria-label="Searching Notes">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      ) : notes.length === 0 ? (
        <p className="m-0 px-2.5 py-3 text-center text-xs text-muted">
          No matching Notes
        </p>
      ) : (
        <div className="grid gap-0.5">
          {notes.map((note, index) => {
            const title = note.label.trim() || "Untitled Note";
            const isSelected = index === selectedIndex;
            return (
              <button
                key={note.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-75",
                  isSelected ? "bg-tint text-ink" : "text-ink hover:bg-tint/60",
                )}
                onMouseEnter={() => onSelectedIndexChange(index)}
                onClick={() => onSelectNote(note)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <StickyNote size={12} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="truncate text-xs font-medium">{title}</span>
                </span>
                {note.tags && note.tags.length > 0 && (
                  <Badge variant="neutral" className="max-w-[84px] truncate">
                    #{note.tags[0].name}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>,
    document.body,
  );
}
