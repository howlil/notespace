import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowUpRight, Link2, MapPin, X } from "lucide-react";
import {
  getNoteInfo,
  type NoteBacklinkInfo,
  type NoteBacklinkKind,
  type NoteInfo,
  type NotePlacementInfo,
} from "../../../../adapters/http/note-api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton,
  Skeleton,
  cn,
} from "../../../../shared/ui";

export type NoteInfoPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | null;
  /** Optional derived first-line label shown in the panel header. */
  noteLabel?: string;
  currentWorkspaceId: string;
  /** Invoked when selecting a placement or backlink that lives on the active Canvas. */
  onFocusNote?: (noteId: string) => void;
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

/**
 * Compact overlay displaying a Note's live Workspace placements and incoming backlinks.
 */
export function NoteInfoPopover({
  open,
  onOpenChange,
  noteId,
  noteLabel,
  currentWorkspaceId,
  onFocusNote,
}: NoteInfoPopoverProps) {
  const router = useRouter({ warn: false });
  const [state, setState] = useState<InfoLoadState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!open || !noteId) return undefined;
    let active = true;
    setState({ status: "loading" });
    void getNoteInfo(noteId)
      .then((info) => {
        if (active) setState({ status: "ready", info });
      })
      .catch((error) => {
        if (!active) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load Note details.",
        });
      });
    return () => {
      active = false;
    };
  }, [open, noteId, retryCount]);

  const navigateToNote = (workspaceId: string, targetNoteId: string) => {
    if (!workspaceId) return;
    onOpenChange(false);
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
    navigateToNote(backlink.workspaceId, backlink.noteId);
  };

  const onlyOnCurrentCanvas = state.status === "ready"
    && state.info.placements.length === 1
    && state.info.placements[0]?.workspaceId === currentWorkspaceId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[min(92vw,420px)] overflow-hidden p-0 max-[480px]:w-[calc(100vw_-_24px)] max-[480px]:p-0"
        data-note-info-popover=""
      >
        <DialogDescription className="sr-only">
          Workspaces where this Note is placed and Notes that reference it.
        </DialogDescription>
        <header className="flex min-h-11 items-center justify-between gap-2 border-b border-line px-4 py-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[13px] font-semibold text-ink">
              Note info
            </DialogTitle>
            {noteLabel?.trim() && (
              <p className="m-0 truncate text-[11px] text-muted">{noteLabel.trim()}</p>
            )}
          </div>
          <IconButton
            type="button"
            variant="ghost"
            aria-label="Close Note info"
            onClick={() => onOpenChange(false)}
          >
            <X size={15} aria-hidden="true" />
          </IconButton>
        </header>

        <div className="max-h-[min(68dvh,460px)] overflow-y-auto overscroll-contain p-3">
          {state.status === "loading" && (
            <div className="grid gap-2.5 py-2" role="status" aria-live="polite" aria-label="Loading Note info">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}

          {state.status === "error" && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas px-3 py-3 text-[11px] text-danger">
              <span className="min-w-0 flex-1">{state.message}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRetryCount((value) => value + 1)}
              >
                Retry
              </Button>
            </div>
          )}

          {state.status === "ready" && (
            <div className="grid gap-4">
              <section aria-label="Placed in Workspaces">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h3 className="m-0 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                    <MapPin size={12} aria-hidden="true" />
                    <span>Placed in Workspaces</span>
                  </h3>
                  <span className="text-[10px] font-medium tabular-nums text-muted">
                    {state.info.placements.length}
                  </span>
                </div>

                {state.info.placements.length === 0 ? (
                  <p className="m-0 rounded-md border border-line bg-canvas px-2.5 py-2 text-[11px] text-muted">
                    Not placed on any Canvas yet.
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {state.info.placements.map((placement) => {
                      const isCurrent = placement.workspaceId === currentWorkspaceId;
                      return (
                        <button
                          key={placement.instanceId}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors duration-100 hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          onClick={() => handlePlacementClick(placement, state.info.noteId)}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {placement.workspaceTitle.trim() || "Untitled workspace"}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {placement.compact && (
                              <span className="rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-muted">
                                Folded
                              </span>
                            )}
                            {isCurrent ? (
                              <span className="rounded-full bg-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                Current
                              </span>
                            ) : (
                              <ArrowUpRight size={13} className="text-muted" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {onlyOnCurrentCanvas && (
                      <p className="m-0 px-2.5 pt-0.5 text-[11px] text-muted">
                        Only placed on this Canvas
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section aria-label="Backlinks">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h3 className="m-0 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                    <Link2 size={12} aria-hidden="true" />
                    <span>Backlinks</span>
                  </h3>
                  <span className="text-[10px] font-medium tabular-nums text-muted">
                    {state.info.backlinks.length}
                  </span>
                </div>

                {state.info.backlinks.length === 0 ? (
                  <p className="m-0 rounded-md border border-line bg-canvas px-2.5 py-2 text-[11px] text-muted">
                    No backlinks yet
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {state.info.backlinks.map((backlink) => {
                      const canOpen = Boolean(backlink.workspaceId);
                      return (
                        <button
                          key={`${backlink.noteId}-${backlink.kind}`}
                          type="button"
                          disabled={!canOpen}
                          title={canOpen ? undefined : "Unplaced Note — place it on a Canvas to open"}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                            canOpen
                              ? "text-ink hover:bg-tint"
                              : "cursor-not-allowed text-muted opacity-60",
                          )}
                          onClick={() => handleBacklinkClick(backlink)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-ink">
                              {backlink.label.trim() || "Untitled Note"}
                            </span>
                            <span className="block truncate text-[10px] text-muted">
                              {backlink.workspaceTitle.trim() || (canOpen ? "Workspace" : "Unplaced Note")}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            {BACKLINK_KIND_LABEL[backlink.kind]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
