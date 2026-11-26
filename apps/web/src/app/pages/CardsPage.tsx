import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, StickyNote } from "lucide-react";
import type { WorkspaceSummary } from "../../entities/workspace";
import {
  NoteCardPreview,
  useNoteCollection,
  type NotePlacedFilter,
  type NoteSortMode,
  type NoteSummary,
  type Tag,
} from "../../modules/note-editor";
import {
  AsyncStateView,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  SearchInput,
  SegmentedControl,
  Skeleton,
  cn,
} from "../../shared/ui";
import { queuePlaceNoteOnWorkspace } from "../shell/active-workspace-store";

const PLACED_OPTIONS: ReadonlyArray<{ value: NotePlacedFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "unplaced", label: "Unplaced" },
];

const LAYOUT_OPTIONS = [
  { value: "grid" as const, label: "Grid", icon: <LayoutGrid size={12} aria-hidden="true" /> },
  { value: "list" as const, label: "List", icon: <List size={12} aria-hidden="true" /> },
];

export function CardsPage({
  loadWorkspaces,
  loadTags,
  batchUpdateTags,
}: {
  loadWorkspaces: () => Promise<WorkspaceSummary[]>;
  loadTags: () => Promise<Tag[]>;
  batchUpdateTags: (noteIds: string[], addTagIds: string[], removeTagIds: string[]) => Promise<void>;
}) {
  const navigate = useNavigate();
  const collection = useNoteCollection({ pageSize: 40 });
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [placingNote, setPlacingNote] = useState<NoteSummary | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Record<string, boolean>>({});
  const [batchTagId, setBatchTagId] = useState<string>("");
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadTags()
      .then((items) => { if (mounted) setAvailableTags(items); })
      .catch(() => { if (mounted) setAvailableTags([]); });
    return () => { mounted = false; };
  }, [loadTags]);

  useEffect(() => {
    if (!placingNote) return undefined;
    let mounted = true;
    setWorkspacesLoading(true);
    void loadWorkspaces()
      .then((items) => {
        if (mounted) setWorkspaces(items);
      })
      .catch(() => {
        if (mounted) setWorkspaces([]);
      })
      .finally(() => {
        if (mounted) setWorkspacesLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [loadWorkspaces, placingNote]);

  const hasActiveFilters = Boolean(collection.query.trim()) || collection.placed !== "all" || collection.tagIds.length > 0;
  const selectedBatchNoteIds = Object.keys(batchSelectedIds).filter((id) => batchSelectedIds[id]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-6 pt-7 pb-8 max-[760px]:pt-12 max-[560px]:p-4 max-[560px]:pt-12">
      <div className="space-y-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="m-0 text-[21px] font-semibold tracking-tight text-ink">Card Library</h1>
            <p className="m-0 mt-0.5 text-xs text-muted">
              Canonical Markdown cards across your Workspaces. Click any card to read or place on a Canvas.
            </p>
          </div>
          <span className="text-xs font-medium tabular-nums text-muted">
            {collection.total} {collection.total === 1 ? "card" : "cards"}
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1 max-w-[340px]">
            <SearchInput
              value={collection.query}
              onChange={(value) => collection.setQuery(value)}
              onClear={() => collection.setQuery("")}
              placeholder="Search cards…"
              aria-label="Search cards"
              className="h-8"
            />
          </div>
          <SegmentedControl
            aria-label="Filter cards by placement"
            options={PLACED_OPTIONS}
            value={collection.placed}
            onChange={collection.setPlaced}
          />
          <select
            aria-label="Sort cards"
            value={collection.sort}
            onChange={(event) => collection.setSort(event.target.value as NoteSortMode)}
            className="h-8 rounded-lg border border-line bg-surface px-2.5 py-0 text-xs font-medium leading-normal text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="updated">Sort: Updated</option>
            <option value="created">Sort: Created</option>
            <option value="title">Sort: Title</option>
          </select>
          <SegmentedControl
            aria-label="Cards layout"
            options={LAYOUT_OPTIONS}
            value={layout}
            onChange={setLayout}
          />
        </div>

        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter cards by tag">
            {availableTags.map((tag) => {
              const active = collection.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => collection.toggleTagId(tag.id)}
                  className={active
                    ? "rounded-full border border-accent bg-tint px-2.5 py-0.5 text-[11px] font-medium text-accent"
                    : "rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted hover:text-ink"}
                >
                  #{tag.name}
                </button>
              );
            })}
            {collection.tagIds.length > 0 && (
              <Button type="button" size="xs" variant="ghost" onClick={() => collection.setTagIds([])}>
                Clear tags
              </Button>
            )}
          </div>
        )}

        {selectedBatchNoteIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-tint/50 px-3 py-1.5 text-xs">
            <span className="font-medium tabular-nums text-ink">{selectedBatchNoteIds.length} selected</span>
            {availableTags.length > 0 && (
              <>
                <select
                  aria-label="Select tag for batch action"
                  value={batchTagId || (availableTags[0]?.id ?? "")}
                  onChange={(event) => setBatchTagId(event.target.value)}
                  className="h-7 rounded border border-line bg-surface px-2 text-xs text-ink"
                >
                  {availableTags.map((t) => (
                    <option key={t.id} value={t.id}>#{t.name}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="xs"
                  variant="primary"
                  disabled={batchBusy}
                  onClick={() => {
                    const targetTagId = batchTagId || availableTags[0]?.id;
                    if (!targetTagId) return;
                    setBatchBusy(true);
                    void batchUpdateTags(selectedBatchNoteIds, [targetTagId], [])
                      .then(() => {
                        setBatchSelectedIds({});
                        collection.refresh();
                      })
                      .finally(() => setBatchBusy(false));
                  }}
                >
                  Add tag
                </Button>
              </>
            )}
            <Button type="button" size="xs" variant="ghost" onClick={() => setBatchSelectedIds({})}>
              Clear
            </Button>
          </div>
        )}

        <AsyncStateView
          status={collection.status}
          loadingFallback={(
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite" aria-label="Loading Card Library">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}
          errorMessage={collection.errorMessage ?? undefined}
          onRetry={collection.refresh}
        >
          {collection.notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface px-6 py-12 text-center">
              <StickyNote size={22} className="text-muted" aria-hidden="true" />
              <p className="m-0 text-sm font-medium text-ink">
                {hasActiveFilters ? "No cards match your filters" : "No cards yet"}
              </p>
              <p className="m-0 max-w-sm text-xs text-muted">
                {hasActiveFilters
                  ? "Try clearing your search or placement filter."
                  : "Create Note cards directly inside any Workspace Canvas."}
              </p>
              {hasActiveFilters && (
                <Button type="button" size="sm" variant="secondary" onClick={collection.resetFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {layout === "grid" ? (
                <div
                  className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]"
                  role="group"
                  aria-label="Card Library grid"
                >
                  {collection.notes.map((note) => (
                    <div key={note.id} className="group/card relative">
                      <input
                        type="checkbox"
                        aria-label={`Select ${note.label || "card"}`}
                        checked={Boolean(batchSelectedIds[note.id])}
                        onChange={(event) => setBatchSelectedIds((prev) => ({ ...prev, [note.id]: event.target.checked }))}
                        className={cn(
                          "absolute right-2.5 top-2.5 z-[var(--z-base)] size-3.5 cursor-pointer accent-accent transition-opacity",
                          batchSelectedIds[note.id] || selectedBatchNoteIds.length > 0
                            ? "opacity-100"
                            : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
                        )}
                      />
                      <NoteCardPreview
                        note={note}
                        layout="grid"
                        reserveTopRight
                        placeLabel="Place on…"
                        onSelect={(item) => void navigate({ to: "/cards/$noteId", params: { noteId: item.id } })}
                        onPlace={(item) => setPlacingNote(item)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-1.5" role="group" aria-label="Card Library list">
                  {collection.notes.map((note) => (
                    <NoteCardPreview
                      key={note.id}
                      note={note}
                      layout="list"
                      placeLabel="Place on…"
                      onSelect={(item) => void navigate({ to: "/cards/$noteId", params: { noteId: item.id } })}
                      onPlace={(item) => setPlacingNote(item)}
                    />
                  ))}
                </div>
              )}

              {collection.hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={collection.loadingMore}
                    onClick={() => void collection.loadMore()}
                  >
                    {collection.loadingMore ? "Loading…" : "Load more cards"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </AsyncStateView>
      </div>

      <Dialog open={Boolean(placingNote)} onOpenChange={(open) => { if (!open) setPlacingNote(null); }}>
        <DialogContent size="sm" padded={false}>
          <DialogDescription className="sr-only">
            Choose a Workspace Canvas to place this linked card on.
          </DialogDescription>
          <DialogHeader
            title="Place linked card on…"
            subtitle={placingNote?.label.trim() || "Untitled card"}
            closeLabel="Cancel placement"
            onClose={() => setPlacingNote(null)}
          />
          <div className="max-h-[300px] overflow-y-auto p-3 no-scrollbar">
            {workspacesLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : workspaces.length === 0 ? (
              <p className="m-0 text-center text-xs text-muted">No Workspaces available yet.</p>
            ) : (
              <div className="grid gap-1">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-line bg-surface px-3 py-2 text-left text-sm font-medium text-ink hover:border-accent hover:bg-tint/40"
                    onClick={() => {
                      if (!placingNote) return;
                      const noteId = placingNote.id;
                      setPlacingNote(null);
                      queuePlaceNoteOnWorkspace(ws.id, noteId);
                      void navigate({
                        to: "/workspaces/$workspaceId",
                        params: { workspaceId: ws.id },
                        search: { noteId: undefined },
                      });
                    }}
                  >
                    <span className="truncate">{ws.title}</span>
                    <span className="text-xs text-accent">Place →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
