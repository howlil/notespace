import { useEffect, useState } from "react";
import { Search, StickyNote, X } from "lucide-react";
import { listNotes, type NoteSummary } from "../../../../adapters/http/note-api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
  Input,
  Skeleton,
  cn,
} from "../../../../shared/ui";

export type NotePickerPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNote: (noteId: string) => void | Promise<void>;
  /** Optional Note IDs already placed on the current Canvas, highlighted with a subtle hint. */
  currentCanvasNoteIds?: ReadonlySet<string>;
};

type PickerFilter = "all" | "unplaced";

type PickerLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; notes: NoteSummary[] };

function summaryPreview(summary: NoteSummary): string {
  if (summary.isEmpty) return "Empty Note";
  const label = summary.label.trim();
  const excerpt = summary.excerpt.trim();
  if (!excerpt) return "";
  if (label && excerpt.startsWith(label)) {
    const rest = excerpt.slice(label.length).replace(/^\s+/, "");
    return rest || excerpt;
  }
  return excerpt;
}

/**
 * Compact searchable Note library picker for placing existing or unplaced Notes
 * onto the active Workspace Canvas.
 */
export function NotePickerPopover({
  open,
  onOpenChange,
  onSelectNote,
  currentCanvasNoteIds,
}: NotePickerPopoverProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PickerFilter>("all");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [state, setState] = useState<PickerLoadState>({ status: "loading" });
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFilter("all");
    setSelectedIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const trimmed = query.trim();
    setState({ status: "loading" });
    setSelectedIndex(0);
    const delay = trimmed ? 140 : 0;
    const timer = window.setTimeout(() => {
      void listNotes({
        q: trimmed || undefined,
        unplaced: filter === "unplaced" ? true : undefined,
        limit: 50,
      })
        .then((notes) => {
          if (active) setState({ status: "ready", notes });
        })
        .catch((error) => {
          if (!active) return;
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load Notes.",
          });
        });
    }, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, query, filter, retryRevision]);

  const notes = state.status === "ready" ? state.notes : [];

  const selectNote = (noteId: string) => {
    onOpenChange(false);
    void onSelectNote(noteId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(94vw,520px)] overflow-hidden p-0 max-[480px]:w-[calc(100vw_-_24px)] max-[480px]:p-0"
        data-note-picker-popover=""
      >
        <DialogTitle className="sr-only">Place existing Note</DialogTitle>
        <DialogDescription className="sr-only">
          Search and filter your Note library to place a Note onto this Canvas.
        </DialogDescription>

        <div className="flex min-h-11 items-center gap-2 border-b border-line px-3.5">
          <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
          <Input
            autoFocus
            className="min-h-0 flex-1 rounded-none border-0 bg-transparent px-0 py-2.5 text-[13px] focus-visible:outline-none"
            placeholder="Search Notes to place…"
            aria-label="Search Notes to place"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && notes.length > 0) {
                event.preventDefault();
                setSelectedIndex((index) => (index + 1) % notes.length);
              } else if (event.key === "ArrowUp" && notes.length > 0) {
                event.preventDefault();
                setSelectedIndex((index) => (index - 1 + notes.length) % notes.length);
              } else if (event.key === "Enter" && notes.length > 0) {
                event.preventDefault();
                const chosen = notes[selectedIndex] ?? notes[0];
                if (chosen) selectNote(chosen.id);
              }
            }}
          />
          <IconButton
            type="button"
            variant="ghost"
            aria-label="Close Note picker"
            onClick={() => onOpenChange(false)}
          >
            <X size={15} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/50 px-3.5 py-2">
          <div className="inline-flex items-center gap-1" role="group" aria-label="Filter Notes">
            {(
              [
                ["all", "All"],
                ["unplaced", "Unplaced"],
              ] as const
            ).map(([value, label]) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "min-h-7 rounded-full border px-2.5 text-[11px] font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active
                      ? "border-accent bg-tint text-accent"
                      : "border-transparent text-muted hover:bg-tint hover:text-ink",
                  )}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {state.status === "ready" && (
            <span className="text-[10px] font-medium tabular-nums text-muted">
              {notes.length} {notes.length === 1 ? "Note" : "Notes"}
            </span>
          )}
        </div>

        <div className="max-h-[min(60dvh,420px)] overflow-y-auto overscroll-contain p-2">
          {state.status === "loading" && (
            <div className="grid gap-2 p-2" role="status" aria-live="polite" aria-label="Loading Notes">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-3 text-[11px] text-danger">
              <span className="min-w-0 flex-1">{state.message}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRetryRevision((value) => value + 1)}
              >
                Retry
              </Button>
            </div>
          )}

          {state.status === "ready" && notes.length === 0 && (
            <p className="m-0 px-3 py-6 text-center text-[11px] text-muted">
              {query.trim()
                ? "No matching Notes."
                : filter === "unplaced"
                  ? "No unplaced Notes."
                  : "No Notes in your library yet."}
            </p>
          )}

          {state.status === "ready" && notes.length > 0 && (
            <div className="grid gap-0.5" role="listbox" aria-label="Notes">
              {notes.map((summary, index) => {
                const active = index === selectedIndex;
                const label = summary.label.trim() || (summary.isEmpty ? "Empty Note" : "Canvas Note");
                const preview = summaryPreview(summary);
                const onCurrentCanvas = currentCanvasNoteIds?.has(summary.id) ?? false;
                return (
                  <button
                    key={summary.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      active ? "bg-tint" : "hover:bg-tint/70",
                    )}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => selectNote(summary.id)}
                  >
                    <StickyNote size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-ink">
                        {label}
                      </span>
                      {preview && preview !== label && (
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted">
                          {preview}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted">
                        {summary.placementCount === 0
                          ? "Unplaced"
                          : `${summary.placementCount} placed`}
                      </span>
                      {onCurrentCanvas && (
                        <span className="rounded-full bg-tint px-1.5 py-0.5 text-[9px] font-medium text-accent">
                          On canvas
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
