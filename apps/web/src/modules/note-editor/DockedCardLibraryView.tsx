import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, BookOpen, Maximize2, Plus } from "lucide-react";
import { getNote, type Note, type NoteSummary } from "../../platform/api/note-api";
import { listTags, type Tag } from "../../platform/api/tag-api";
import {
  AsyncStateView,
  Button,
  SearchInput,
  SegmentedControl,
  Skeleton,
  cn,
} from "../../shared/ui";
import { NoteCardPreview } from "./NoteCardPreview";
import { NoteReadView } from "./NoteReadView";
import { useNoteCollection } from "./use-note-collection";

export type DockedCardLibraryViewProps = {
  drawerWidth: number;
  activeWorkspaceId?: string;
  selectedNoteId: string | null;
  detailNoteId: string | null;
  onDetailNoteChange: (noteId: string | null) => void;
  onOpenInSideCards: (noteId: string) => void;
  onOpenCardPage?: (noteId: string) => void;
  onPlaceNote: (noteId: string, options?: { clientPoint?: { x: number; y: number } }) => void;
  onFilterByTag?: (tagId: string) => void;
};

type ScopeMode = "related" | "all" | "unplaced";

export function DockedCardLibraryView({
  drawerWidth,
  activeWorkspaceId,
  selectedNoteId,
  detailNoteId,
  onDetailNoteChange,
  onOpenInSideCards,
  onOpenCardPage,
  onPlaceNote,
  onFilterByTag,
}: DockedCardLibraryViewProps) {
  const [scope, setScope] = useState<ScopeMode>(activeWorkspaceId ? "related" : "all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [detailState, setDetailState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; note: Note }
  >({ status: "idle" });
  const [dragGhost, setDragGhost] = useState<{ note: NoteSummary; x: number; y: number } | null>(null);

  const collection = useNoteCollection({
    workspaceId: activeWorkspaceId && scope === "related" ? activeWorkspaceId : undefined,
    initialPlaced: "all",
    initialScope: activeWorkspaceId ? "related" : "all",
    selectedNoteId,
    pageSize: 30,
  });

  useEffect(() => {
    collection.setSelectedNoteId(selectedNoteId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNoteId]);

  useEffect(() => {
    let mounted = true;
    void listTags()
      .then((loaded) => {
        if (mounted) setTags(loaded);
      })
      .catch(() => {
        // Non-fatal: tag filter chips stay hidden if tags fail to load.
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId && scope === "related") {
      setScope("all");
    }
  }, [activeWorkspaceId, scope]);

  useEffect(() => {
    if (scope === "unplaced") {
      collection.setScope("all");
      collection.setPlaced("unplaced");
      collection.setScopeWorkspaceId(undefined);
    } else if (scope === "related" && activeWorkspaceId) {
      collection.setScope("related");
      collection.setPlaced("all");
      collection.setScopeWorkspaceId(activeWorkspaceId);
    } else {
      collection.setScope("all");
      collection.setPlaced("all");
      collection.setScopeWorkspaceId(undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, scope]);

  useEffect(() => {
    if (!detailNoteId) {
      setDetailState({ status: "idle" });
      return undefined;
    }
    let mounted = true;
    setDetailState({ status: "loading" });
    void getNote(detailNoteId)
      .then((note) => {
        if (mounted) setDetailState({ status: "ready", note });
      })
      .catch((error) => {
        if (!mounted) return;
        setDetailState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load Note.",
        });
      });
    return () => {
      mounted = false;
    };
  }, [detailNoteId]);

  const handleCardPointerDown = (event: ReactPointerEvent<HTMLElement>, note: NoteSummary) => {
    if (event.button !== 0 || !activeWorkspaceId) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const onMove = (moveEvent: PointerEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragging && distance > 6) {
        dragging = true;
      }
      if (dragging) {
        setDragGhost({ note, x: moveEvent.clientX, y: moveEvent.clientY });
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragGhost(null);
      if (!dragging) return;
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      if (target instanceof Element && target.closest("[data-notespace-canvas-surface]")) {
        onPlaceNote(note.id, { clientPoint: { x: upEvent.clientX, y: upEvent.clientY } });
        window.setTimeout(() => collection.refresh(), 250);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (detailNoteId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line/70 bg-surface px-3">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onDetailNoteChange(null)}
          >
            <ArrowLeft size={13} aria-hidden="true" />
            <span>Card Library</span>
          </Button>
          <div className="flex items-center gap-1">
            {onOpenCardPage && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label="Open full card page"
                onClick={() => onOpenCardPage(detailNoteId)}
              >
                <Maximize2 size={12} aria-hidden="true" />
                <span>Open</span>
              </Button>
            )}
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() => onOpenInSideCards(detailNoteId)}
            >
              <BookOpen size={12} aria-hidden="true" />
              <span>Side Cards</span>
            </Button>
            {activeWorkspaceId && (
              <Button
                type="button"
                size="xs"
                variant="primary"
                onClick={() => onPlaceNote(detailNoteId)}
              >
                <Plus size={12} aria-hidden="true" />
                <span>Place</span>
              </Button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3.5 no-scrollbar">
          <AsyncStateView
            status={detailState.status === "idle" ? "loading" : detailState.status}
            loadingFallback={(
              <div className="grid gap-2" role="status" aria-live="polite" aria-label="Loading card">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            )}
            errorMessage={detailState.status === "error" ? detailState.message : undefined}
            onRetry={() => onDetailNoteChange(detailNoteId)}
          >
            {detailState.status === "ready" && (
              <div className="notespace-note-prose text-sm text-ink">
                <NoteReadView document={detailState.note.document} />
              </div>
            )}
          </AsyncStateView>
        </div>
      </div>
    );
  }

  const scopeOptions = activeWorkspaceId
    ? [
      { value: "related" as const, label: "Related" },
      { value: "all" as const, label: "All" },
      { value: "unplaced" as const, label: "Unplaced" },
    ]
    : [
      { value: "all" as const, label: "All" },
      { value: "unplaced" as const, label: "Unplaced" },
    ];

  const twoColumns = drawerWidth >= 420;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-line/70 bg-surface px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[13px] font-semibold text-ink">Card Library</h2>
          <SegmentedControl
            aria-label="Filter library scope"
            variant="tabs"
            options={scopeOptions}
            value={scope}
            onChange={setScope}
          />
        </div>
        <SearchInput
          value={collection.query}
          onChange={(value) => collection.setQuery(value)}
          onClear={() => collection.setQuery("")}
          placeholder="Search cards…"
          aria-label="Search Card Library"
          className="h-8"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1" aria-label="Filter by tag">
            {tags.map((tag) => {
              const active = collection.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    collection.toggleTagId(tag.id);
                    onFilterByTag?.(tag.id);
                  }}
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
                    active
                      ? "border-accent bg-tint text-accent"
                      : "border-line/80 bg-canvas text-muted hover:border-accent/50 hover:text-ink",
                  )}
                >
                  #{tag.name}
                </button>
              );
            })}
            {collection.tagIds.length > 0 && (
              <button
                type="button"
                onClick={() => collection.setTagIds([])}
                className="px-1.5 py-0.5 text-xs font-medium text-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 no-scrollbar">
        <AsyncStateView
          status={collection.status}
          loadingFallback={(
            <div className="grid gap-1.5" role="status" aria-live="polite" aria-label="Loading cards">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          errorMessage={collection.errorMessage ?? undefined}
          onRetry={collection.refresh}
        >
          {collection.notes.length === 0 ? (
            <div className="rounded-lg border border-line bg-canvas px-3 py-6 text-center text-xs text-muted">
              {collection.query.trim() || scope !== "all" || collection.tagIds.length > 0
                ? "No matching cards."
                : "No cards yet. Create a Note on Canvas."}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className={twoColumns ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-1.5"}>
                {collection.notes.map((note) => (
                  <NoteCardPreview
                    key={note.id}
                    note={note}
                    layout={twoColumns ? "grid" : "compact"}
                    selected={selectedNoteId === note.id}
                    onSelect={(item) => onDetailNoteChange(item.id)}
                    onPlace={activeWorkspaceId ? (item) => onPlaceNote(item.id) : undefined}
                    onPointerDown={handleCardPointerDown}
                  />
                ))}
              </div>
              {collection.hasMore && (
                <div className="flex justify-center pt-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={collection.loadingMore}
                    onClick={() => void collection.loadMore()}
                  >
                    {collection.loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </AsyncStateView>
      </div>

      {dragGhost && (
        <div
          className="pointer-events-none fixed z-[var(--z-popover)] w-52 rounded-lg border border-accent bg-surface p-2.5"
          style={{ left: dragGhost.x + 12, top: dragGhost.y + 12 }}
        >
          <div className="truncate text-xs font-semibold text-ink">
            {dragGhost.note.label.trim() || "Untitled card"}
          </div>
          <div className="text-[11px] text-muted">Drop on Canvas to place linked</div>
        </div>
      )}
    </div>
  );
}
