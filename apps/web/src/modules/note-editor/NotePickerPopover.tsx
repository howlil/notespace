import { useEffect, useState } from "react";
import { StickyNote, X } from "lucide-react";
import { listNotes, type NoteSummary } from "../../platform/api/note-api";
import {
  Badge,
  CommandListDialog,
  IconButton,
  SegmentedControl,
  Skeleton,
  cn,
} from "../../shared/ui";

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

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unplaced", label: "Unplaced" },
] as const;

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
    <CommandListDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Place existing Note"
      description="Search and filter your Note library to place a Note onto this Canvas."
      size="lg"
      dataAttribute={{ "data-note-picker-popover": "" }}
      query={query}
      onQueryChange={setQuery}
      placeholder="Search Notes to place…"
      searchAriaLabel="Search Notes to place"
      searchRightSlot={(
        <IconButton
          type="button"
          size="xs"
          aria-label="Close Note picker"
          onClick={() => onOpenChange(false)}
        >
          <X size={15} aria-hidden="true" />
        </IconButton>
      )}
      subHeader={(
        <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/50 px-3.5 py-2">
          <SegmentedControl
            aria-label="Filter Notes"
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
          />
          {state.status === "ready" && (
            <span className="text-2xs font-medium tabular-nums text-muted">
              {notes.length} {notes.length === 1 ? "Note" : "Notes"}
            </span>
          )}
        </div>
      )}
      status={state.status}
      loadingFallback={(
        <div className="grid gap-2 p-2" role="status" aria-live="polite" aria-label="Loading Notes">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      errorMessage={state.status === "error" ? state.message : undefined}
      onRetry={() => setRetryRevision((value) => value + 1)}
      items={notes}
      selectedIndex={selectedIndex}
      onSelectedIndexChange={setSelectedIndex}
      onSelect={(summary) => selectNote(summary.id)}
      listRole="listbox"
      listAriaLabel="Notes"
      bodyClassName="max-h-[min(60dvh,420px)] p-2"
      emptyFallback={(
        <p className="m-0 px-3 py-6 text-center text-xs text-muted">
          {query.trim()
            ? "No matching Notes."
            : filter === "unplaced"
              ? "No unplaced Notes."
              : "No Notes in your library yet."}
        </p>
      )}
      renderItem={(summary, { selected: active, index }) => {
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
              <span className="block truncate text-sm font-medium text-ink">
                {label}
              </span>
              {preview && preview !== label && (
                <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted">
                  {preview}
                </span>
              )}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Badge variant="outline">
                {summary.placementCount === 0
                  ? "Unplaced"
                  : `${summary.placementCount} placed`}
              </Badge>
              {onCurrentCanvas && (
                <Badge variant="accent">On canvas</Badge>
              )}
            </span>
          </button>
        );
      }}
    />
  );
}
