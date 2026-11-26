import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { noteFirstLine } from "../../entities/note";
import type { WorkspaceSummary } from "../../entities/workspace";
import { CardDetailView, type Note } from "../../modules/note-editor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, Skeleton } from "../../shared/ui";
import { queuePlaceNoteOnWorkspace } from "../shell/active-workspace-store";
import { TabHistoryControls } from "../shell/TabHistoryControls";

export function CardDetailPage({
  note,
  loadWorkspaces,
}: {
  note: Note;
  loadWorkspaces: () => Promise<WorkspaceSummary[]>;
}) {
  const navigate = useNavigate();
  const [placingNote, setPlacingNote] = useState<Note | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);

  useEffect(() => {
    if (!placingNote) return undefined;
    let mounted = true;
    setWorkspacesLoading(true);
    void loadWorkspaces()
      .then((items) => { if (mounted) setWorkspaces(items); })
      .catch(() => { if (mounted) setWorkspaces([]); })
      .finally(() => { if (mounted) setWorkspacesLoading(false); });
    return () => { mounted = false; };
  }, [loadWorkspaces, placingNote]);

  const title = noteFirstLine(note.document).trim() || "Untitled card";

  return (
    <div className="flex min-h-full w-full flex-col bg-surface">
      <CardDetailView
        initialNote={note}
        historyControls={<TabHistoryControls />}
        parentLink={(
          <Link
            to="/cards"
            activeOptions={{ exact: true }}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-muted transition-colors hover:bg-tint hover:text-ink"
          >
            Card Library
          </Link>
        )}
        onPlaceOnWorkspace={(target) => setPlacingNote(target)}
        onOpenRelatedCard={(relatedNoteId) => {
          void navigate({ to: "/cards/$noteId", params: { noteId: relatedNoteId } });
        }}
        onNavigateToWorkspace={(workspaceId, noteId) => {
          void navigate({
            to: "/workspaces/$workspaceId",
            params: { workspaceId },
            search: { noteId },
          });
        }}
      />

      <Dialog open={Boolean(placingNote)} onOpenChange={(open) => { if (!open) setPlacingNote(null); }}>
        <DialogContent size="sm" padded={false}>
          <DialogDescription className="sr-only">
            Choose a Workspace Canvas to place this linked card on.
          </DialogDescription>
          <DialogHeader
            title="Place linked card on…"
            subtitle={title}
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
