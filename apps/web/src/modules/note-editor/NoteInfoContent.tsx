import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowUpRight, Link2, MapPin, Plus, Tag as TagIcon } from "lucide-react";
import {
  getNoteInfo,
  type NoteBacklinkInfo,
  type NoteBacklinkKind,
  type NoteInfo,
  type NoteOutgoingRefInfo,
  type NotePlacementInfo,
} from "../../platform/api/note-api";
import {
  assignNoteTag,
  removeNoteTag,
  type Tag,
} from "../../platform/api/tag-api";
import {
  AsyncStateView,
  Badge,
  Button,
  Skeleton,
  cn,
} from "../../shared/ui";
import { TagPickerChips } from "./TagPickerChips";

export type NoteInfoContentProps = {
  noteId: string | null;
  active?: boolean;
  currentWorkspaceId?: string;
  onAfterNavigate?: () => void;
  onFocusNote?: (noteId: string) => void;
  onOpenNoteInSideCards?: (noteId: string) => void;
  onPlaceNote?: (noteId: string) => void;
  onFilterByTag?: (tag: Tag) => void;
};

type InfoLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; info: NoteInfo };

const BACKLINK_KIND_LABEL: Record<NoteBacklinkKind, string> = {
  link: "Link",
  embed: "Embed",
  blockRef: "Block",
};

export function NoteInfoContent({
  noteId,
  active = true,
  currentWorkspaceId,
  onAfterNavigate,
  onFocusNote,
  onOpenNoteInSideCards,
  onPlaceNote,
  onFilterByTag,
}: NoteInfoContentProps) {
  const router = useRouter({ warn: false });
  const [state, setState] = useState<InfoLoadState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!active || !noteId) return undefined;
    let mounted = true;
    setState({ status: "loading" });
    void getNoteInfo(noteId)
      .then((info) => {
        if (mounted) setState({ status: "ready", info });
      })
      .catch((error) => {
        if (!mounted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load Note details.",
        });
      });
    return () => {
      mounted = false;
    };
  }, [active, noteId, retryCount]);

  if (!noteId) {
    return (
      <p className="m-0 rounded-md border border-line bg-canvas px-3 py-4 text-center text-xs text-muted">
        Select a Note to inspect its Workspace placements and incoming backlinks.
      </p>
    );
  }

  const navigateToNote = (workspaceId: string, targetNoteId: string) => {
    if (!workspaceId) return;
    onAfterNavigate?.();
    if (workspaceId === currentWorkspaceId && onFocusNote) {
      onFocusNote(targetNoteId);
      return;
    }
    const href = `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(targetNoteId)}`;
    if (router) {
      void router.navigate({ href });
    }
  };

  const handlePlacementClick = (placement: NotePlacementInfo, targetNoteId: string) => {
    navigateToNote(placement.workspaceId, targetNoteId);
  };

  const handleBacklinkClick = (backlink: NoteBacklinkInfo) => {
    if (onOpenNoteInSideCards) {
      onOpenNoteInSideCards(backlink.noteId);
      return;
    }
    navigateToNote(backlink.workspaceId, backlink.noteId);
  };

  const handleOutgoingClick = (ref: NoteOutgoingRefInfo) => {
    if (ref.unresolved) return;
    if (onOpenNoteInSideCards) {
      onOpenNoteInSideCards(ref.noteId);
      return;
    }
    if (currentWorkspaceId && onFocusNote) {
      onAfterNavigate?.();
      onFocusNote(ref.noteId);
    }
  };

  const handleAssignTag = async (tag: Tag) => {
    if (state.status !== "ready") return;
    await assignNoteTag(state.info.noteId, tag.id);
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const existing = prev.info.tags ?? [];
      if (existing.some((t) => t.id === tag.id)) return prev;
      return {
        status: "ready",
        info: { ...prev.info, tags: [...existing, tag] },
      };
    });
  };

  const handleRemoveTag = async (tagId: string) => {
    if (state.status !== "ready") return;
    await removeNoteTag(state.info.noteId, tagId);
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      return {
        status: "ready",
        info: {
          ...prev.info,
          tags: (prev.info.tags ?? []).filter((t) => t.id !== tagId),
        },
      };
    });
  };

  const onlyOnCurrentCanvas = Boolean(
    currentWorkspaceId
    && state.status === "ready"
    && state.info.placements.length === 1
    && state.info.placements[0]?.workspaceId === currentWorkspaceId,
  );

  return (
    <AsyncStateView
      status={state.status}
      loadingFallback={(
        <div className="grid gap-2.5 py-2" role="status" aria-live="polite" aria-label="Loading Note info">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      errorMessage={state.status === "error" ? state.message : undefined}
      onRetry={() => setRetryCount((value) => value + 1)}
    >
      {state.status === "ready" && (
        <div className="grid gap-4">
          <section aria-label="Tags">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h3 className="m-0 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <TagIcon size={12} aria-hidden="true" />
                <span>Tags</span>
              </h3>
              <span className="text-2xs font-medium tabular-nums text-muted">
                {(state.info.tags ?? []).length}
              </span>
            </div>
            <TagPickerChips
              tags={state.info.tags ?? []}
              onAssignTag={handleAssignTag}
              onRemoveTag={handleRemoveTag}
              onClickTag={onFilterByTag ? (tag) => {
                onAfterNavigate?.();
                onFilterByTag(tag);
              } : undefined}
              onTagsChanged={() => setRetryCount((value) => value + 1)}
            />
          </section>

          <section aria-label="Placed in Workspaces">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <h3 className="m-0 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <MapPin size={12} aria-hidden="true" />
                <span>Placed in Workspaces</span>
              </h3>
              <div className="flex items-center gap-1.5">
                {onPlaceNote && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="text-accent"
                    onClick={() => onPlaceNote(state.info.noteId)}
                  >
                    <Plus size={11} aria-hidden="true" />
                    <span>{currentWorkspaceId ? "Place here" : "Place on…"}</span>
                  </Button>
                )}
                <span className="text-xs font-medium tabular-nums text-muted">
                  {state.info.placements.length}
                </span>
              </div>
            </div>

            {state.info.placements.length === 0 ? (
              <p className="m-0 rounded-md border border-line bg-canvas px-2.5 py-2 text-xs text-muted">
                Not placed on any Canvas yet.
              </p>
            ) : (
              <div className="grid gap-1">
                {state.info.placements.map((placement) => {
                  const isCurrent = Boolean(currentWorkspaceId && placement.workspaceId === currentWorkspaceId);
                  return (
                    <button
                      key={placement.instanceId}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left text-sm text-ink transition-colors duration-100 hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      onClick={() => handlePlacementClick(placement, state.info.noteId)}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {placement.workspaceTitle.trim() || "Untitled workspace"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {placement.compact && <Badge variant="outline">Folded</Badge>}
                        {isCurrent ? (
                          <Badge variant="accent">Current</Badge>
                        ) : (
                          <ArrowUpRight size={13} className="text-muted" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  );
                })}
                {onlyOnCurrentCanvas && (
                  <p className="m-0 px-2.5 pt-0.5 text-xs text-muted">
                    Only placed on this Canvas
                  </p>
                )}
              </div>
            )}
          </section>

          <section aria-label="Incoming Backlinks">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h3 className="m-0 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Link2 size={12} aria-hidden="true" />
                <span>Incoming Backlinks</span>
              </h3>
              <span className="text-2xs font-medium tabular-nums text-muted">
                {state.info.backlinks.length}
              </span>
            </div>

            {state.info.backlinks.length === 0 ? (
              <p className="m-0 rounded-md border border-line bg-canvas px-2.5 py-2 text-xs text-muted">
                No incoming backlinks yet
              </p>
            ) : (
              <div className="grid gap-1">
                {state.info.backlinks.map((backlink) => {
                  const canOpen = Boolean(onOpenNoteInSideCards || backlink.workspaceId);
                  return (
                    <div
                      key={`${backlink.noteId}-${backlink.kind}`}
                      className="flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 transition-colors hover:bg-tint"
                    >
                      <button
                        type="button"
                        disabled={!canOpen}
                        title={canOpen ? undefined : "Unplaced Note — place it on a Canvas to open"}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1.5 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                          canOpen ? "text-ink" : "cursor-not-allowed text-muted opacity-60",
                        )}
                        onClick={() => handleBacklinkClick(backlink)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {backlink.label.trim() || "Untitled Note"}
                          </span>
                          {backlink.excerpt ? (
                            <span className="block truncate text-2xs text-muted">
                              {backlink.excerpt}
                            </span>
                          ) : (
                            <span className="block truncate text-2xs text-muted">
                              {backlink.workspaceTitle.trim() || (backlink.workspaceId ? "Workspace" : "Unplaced Note")}
                            </span>
                          )}
                        </span>
                        <Badge variant="outline">{BACKLINK_KIND_LABEL[backlink.kind]}</Badge>
                      </button>
                      {onPlaceNote && currentWorkspaceId && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="shrink-0 text-muted hover:text-accent"
                          aria-label={`Place ${backlink.label.trim() || "Note"} on current canvas`}
                          onClick={() => onPlaceNote(backlink.noteId)}
                        >
                          <Plus size={11} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Outgoing Links">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h3 className="m-0 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <ArrowUpRight size={12} aria-hidden="true" />
                <span>Outgoing Links</span>
              </h3>
              <span className="text-2xs font-medium tabular-nums text-muted">
                {(state.info.outgoing ?? []).length}
              </span>
            </div>

            {(state.info.outgoing ?? []).length === 0 ? (
              <p className="m-0 rounded-md border border-line bg-canvas px-2.5 py-2 text-xs text-muted">
                No outgoing links yet
              </p>
            ) : (
              <div className="grid gap-1">
                {(state.info.outgoing ?? []).map((ref) => {
                  const canOpen = !ref.unresolved && Boolean(onOpenNoteInSideCards || (currentWorkspaceId && onFocusNote));
                  return (
                    <div
                      key={`${ref.noteId}-${ref.kind}`}
                      className="flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5 transition-colors hover:bg-tint"
                    >
                      <button
                        type="button"
                        disabled={!canOpen}
                        title={ref.unresolved ? "Target Note no longer exists" : undefined}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1.5 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                          canOpen ? "text-ink" : "cursor-not-allowed text-muted opacity-60",
                        )}
                        onClick={() => handleOutgoingClick(ref)}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {ref.label.trim() || "Untitled Note"}
                          </span>
                          {ref.excerpt && (
                            <span className="block truncate text-2xs text-muted">
                              {ref.excerpt}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {ref.unresolved && <Badge variant="danger">Unresolved</Badge>}
                          <Badge variant="outline">{BACKLINK_KIND_LABEL[ref.kind]}</Badge>
                        </span>
                      </button>
                      {onPlaceNote && currentWorkspaceId && !ref.unresolved && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="shrink-0 text-muted hover:text-accent"
                          aria-label={`Place ${ref.label.trim() || "Note"} on current canvas`}
                          onClick={() => onPlaceNote(ref.noteId)}
                        >
                          <Plus size={11} aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </AsyncStateView>
  );
}
