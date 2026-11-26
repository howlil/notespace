import type { PointerEvent } from "react";
import { Plus } from "lucide-react";
import type { NoteSummary } from "../../platform/api/note-api";
import { Badge, Button, CardEntityIcon, cn } from "../../shared/ui";

export type NoteCardPreviewProps = {
  note: NoteSummary;
  layout?: "grid" | "list" | "compact";
  selected?: boolean;
  reserveTopRight?: boolean;
  onSelect: (note: NoteSummary) => void;
  onPlace?: (note: NoteSummary) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>, note: NoteSummary) => void;
  placeLabel?: string;
};

function excerptText(note: NoteSummary): string {
  if (note.isEmpty) return "";
  const label = note.label.trim();
  const excerpt = note.excerpt.trim();
  if (!excerpt || excerpt === label) return "";
  if (label && excerpt.startsWith(label)) {
    return excerpt.slice(label.length).replace(/^\s+/, "");
  }
  return excerpt;
}

export function NoteCardPreview({
  note,
  layout = "grid",
  selected = false,
  reserveTopRight = false,
  onSelect,
  onPlace,
  onPointerDown,
  placeLabel = "Place",
}: NoteCardPreviewProps) {
  const title = note.label.trim() || "Untitled card";
  const preview = excerptText(note);
  const placementLabel = note.placementCount > 0
    ? `${note.placementCount} ${note.placementCount === 1 ? "board" : "boards"}`
    : "Unplaced";

  if (layout === "compact") {
    const metaParts: string[] = [placementLabel];
    if (note.tags && note.tags.length > 0) {
      metaParts.push(note.tags.slice(0, 2).map((tag) => `#${tag.name}`).join(" "));
      if (note.tags.length > 2) metaParts.push(`+${note.tags.length - 2}`);
    }
    if (note.relatedReason) metaParts.push(note.relatedReason);

    return (
      <article
        data-note-card-id={note.id}
        className={cn(
          "group relative flex items-start gap-1.5 rounded-lg border text-left transition-colors duration-100",
          selected
            ? "border-accent bg-tint/45"
            : "border-line/85 bg-surface hover:border-accent/45 hover:bg-tint/20",
        )}
        onPointerDown={(event) => onPointerDown?.(event, note)}
      >
        <button
          type="button"
          className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`Open ${title}`}
          onClick={() => onSelect(note)}
        >
          <div className="flex items-center gap-1.5">
            <CardEntityIcon size={13} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-ink">
              {title}
            </div>
          </div>
          {preview && (
            <p className="m-0 mt-1 line-clamp-2 pl-[19px] text-xs leading-relaxed text-muted">
              {preview}
            </p>
          )}
          <div className="mt-1 truncate pl-[19px] text-xs text-muted/85 tabular-nums">
            {metaParts.join(" · ")}
          </div>
        </button>
        {onPlace && (
          <div className="shrink-0 pt-1.5 pr-1.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-muted hover:text-accent"
              aria-label={`${placeLabel} ${title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onPlace(note);
              }}
            >
              <Plus size={11} aria-hidden="true" />
              <span>{placeLabel}</span>
            </Button>
          </div>
        )}
      </article>
    );
  }

  if (layout === "list") {
    return (
      <article
        data-note-card-id={note.id}
        className={cn(
          "group relative flex items-center justify-between gap-2 rounded-lg border text-left transition-colors duration-100",
          selected
            ? "border-accent bg-tint/50"
            : "border-line bg-surface hover:border-accent/50 hover:bg-tint/25",
        )}
        onPointerDown={(event) => onPointerDown?.(event, note)}
      >
        <button
          type="button"
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={`Open ${title}`}
          onClick={() => onSelect(note)}
        >
          <div className="flex items-center gap-1.5">
            <CardEntityIcon size={13} className="shrink-0 text-muted" />
            <div className="truncate text-[13px] font-medium text-ink">{title}</div>
            {note.relatedReason && (
              <Badge variant="subtle" className="max-w-[120px] truncate">
                {note.relatedReason}
              </Badge>
            )}
          </div>
          {preview && (
            <div className="truncate pl-[19px] text-xs text-muted">
              {preview}
            </div>
          )}
          {note.tags && note.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1 pl-[19px]">
              {note.tags.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="neutral">
                  #{tag.name}
                </Badge>
              ))}
              {note.tags.length > 3 && (
                <span className="text-xs text-muted">+{note.tags.length - 3}</span>
              )}
            </div>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2 pr-3">
          <Badge variant={note.placementCount > 0 ? "accent" : "outline"} className="tabular-nums">
            {placementLabel}
          </Badge>
          {onPlace && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-label={`${placeLabel} ${title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onPlace(note);
              }}
            >
              <Plus size={12} aria-hidden="true" />
              <span>{placeLabel}</span>
            </Button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      data-note-card-id={note.id}
      className={cn(
        "group relative flex min-h-[104px] flex-col justify-between rounded-lg border text-left transition-colors duration-100",
        selected
          ? "border-accent bg-tint/40 ring-1 ring-inset ring-accent/25"
          : "border-line bg-surface hover:border-accent/50",
      )}
      onPointerDown={(event) => onPointerDown?.(event, note)}
    >
      <button
        type="button"
        className="w-full min-w-0 flex-1 space-y-1.5 rounded-t-lg px-3 pt-3 pb-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`Open ${title}`}
        onClick={() => onSelect(note)}
      >
        <div className={cn("flex items-start justify-between gap-1.5", reserveTopRight && "pr-6")}>
          <div className="flex min-w-0 items-start gap-1.5">
            <CardEntityIcon size={13} className="mt-0.5 shrink-0 text-muted" />
            <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{title}</div>
          </div>
          {note.relatedReason && (
            <Badge variant="subtle" className="shrink-0 max-w-[110px] truncate">
              {note.relatedReason}
            </Badge>
          )}
        </div>
        {preview && (
          <p className="m-0 line-clamp-3 text-xs leading-relaxed text-muted">
            {preview}
          </p>
        )}
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {note.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id} variant="neutral">
                #{tag.name}
              </Badge>
            ))}
            {note.tags.length > 3 && (
              <span className="text-xs text-muted">+{note.tags.length - 3}</span>
            )}
          </div>
        )}
      </button>
      <div className="flex items-center justify-between gap-1.5 px-3 pt-0.5 pb-2.5">
        <span className="text-xs font-medium text-muted tabular-nums">
          {placementLabel}
        </span>
        {onPlace && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:text-accent"
            aria-label={`${placeLabel} ${title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPlace(note);
            }}
          >
            <Plus size={11} aria-hidden="true" />
            <span>{placeLabel}</span>
          </Button>
        )}
      </div>
    </article>
  );
}
