import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Maximize2, Pencil, Plus, X } from "lucide-react";
import { noteFirstLine, type NoteDocument } from "../../entities/note";
import { getNote, updateNote, type Note } from "../../platform/api/note-api";
import {
  AsyncStateView,
  Button,
  IconButton,
  SegmentedControl,
  Skeleton,
  cn,
} from "../../shared/ui";
import { MarkdownNoteEditor } from "./MarkdownNoteEditor";
import { NoteReadView } from "./NoteReadView";

export type SideCardsLayout = "tabs" | "stack";

export type DockedSideCardsViewProps = {
  sideCardIds: string[];
  activeSideCardId: string | null;
  layout: SideCardsLayout;
  highlightBlockId?: string | null;
  activeWorkspaceId?: string;
  onLayoutChange: (layout: SideCardsLayout) => void;
  onSelectCard: (noteId: string) => void;
  onCloseCard: (noteId: string) => void;
  onPlaceNote?: (noteId: string) => void;
  onFocusNote?: (noteId: string) => void;
  onOpenCardPage?: (noteId: string) => void;
};

type CardEntry =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; note: Note };

const LAYOUT_OPTIONS = [
  { value: "stack" as const, label: "Stack" },
  { value: "tabs" as const, label: "Tabs" },
];

export function DockedSideCardsView({
  sideCardIds,
  activeSideCardId,
  layout,
  highlightBlockId = null,
  activeWorkspaceId,
  onLayoutChange,
  onSelectCard,
  onCloseCard,
  onPlaceNote,
  onFocusNote,
  onOpenCardPage,
}: DockedSideCardsViewProps) {
  const [entries, setEntries] = useState<Record<string, CardEntry>>({});
  const [foldedIds, setFoldedIds] = useState<Record<string, boolean>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadNote = useCallback(async (noteId: string) => {
    setEntries((prev) => ({ ...prev, [noteId]: { status: "loading" } }));
    try {
      const note = await getNote(noteId);
      setEntries((prev) => ({ ...prev, [noteId]: { status: "ready", note } }));
    } catch (error) {
      setEntries((prev) => ({
        ...prev,
        [noteId]: {
          status: "error",
          message: error instanceof Error ? error.message : "Could not load Note.",
        },
      }));
    }
  }, []);

  useEffect(() => {
    for (const noteId of sideCardIds) {
      if (!entries[noteId]) {
        void loadNote(noteId);
      }
    }
  }, [entries, loadNote, sideCardIds]);

  const handleDocumentChange = useCallback(async (noteId: string, document: NoteDocument) => {
    const entry = entries[noteId];
    if (entry?.status !== "ready") return;
    const expectedRevision = entry.note.revision;
    setEntries((prev) => ({
      ...prev,
      [noteId]: { status: "ready", note: { ...entry.note, document } },
    }));
    setSavingNoteId(noteId);
    setSaveError(null);
    try {
      const updated = await updateNote(noteId, document, expectedRevision);
      setEntries((prev) => ({
        ...prev,
        [noteId]: { status: "ready", note: updated },
      }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save Note.");
    } finally {
      setSavingNoteId((curr) => (curr === noteId ? null : curr));
    }
  }, [entries]);

  const currentActiveId = activeSideCardId && sideCardIds.includes(activeSideCardId)
    ? activeSideCardId
    : (sideCardIds[0] ?? null);

  if (sideCardIds.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface px-3">
          <h2 className="m-0 text-[13px] font-semibold text-ink">Side Cards</h2>
        </div>
        <div className="flex flex-1 items-start p-3">
          <p className="m-0 w-full rounded-md border border-line bg-canvas px-3 py-4 text-center text-xs text-muted">
            Alt+Click any Canvas Note or select a card from Card Library to read it here.
          </p>
        </div>
      </div>
    );
  }

  const renderCardBody = (noteId: string) => {
    const entry = entries[noteId] ?? { status: "loading" as const };
    const isEditing = editingNoteId === noteId;
    return (
      <AsyncStateView
        status={entry.status}
        loadingFallback={(
          <div className="grid gap-2 py-2" role="status" aria-live="polite" aria-label="Loading card">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        )}
        errorMessage={entry.status === "error" ? entry.message : undefined}
        onRetry={() => void loadNote(noteId)}
      >
        {entry.status === "ready" && (
          isEditing ? (
            <div className="space-y-2">
              <MarkdownNoteEditor
                noteId={entry.note.id}
                workspaceId={activeWorkspaceId ?? ""}
                document={entry.note.document}
                readDocument={() => (entry.status === "ready" ? entry.note.document : undefined)}
                onDocumentChange={(doc) => void handleDocumentChange(noteId, doc)}
                onResize={() => {}}
                onError={(msg) => setSaveError(msg)}
                onEscape={() => setEditingNoteId(null)}
              />
              {saveError && <p className="m-0 text-[11px] text-danger">{saveError}</p>}
            </div>
          ) : (
            <div className="notespace-note-prose text-sm text-ink" data-note-scroll="">
              <NoteReadView
                document={entry.note.document}
                highlightBlockId={currentActiveId === noteId ? highlightBlockId : null}
              />
            </div>
          )
        )}
      </AsyncStateView>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-line/70 bg-surface px-3">
        <div className="flex items-center gap-1.5">
          <h2 className="m-0 text-[13px] font-semibold text-ink">Side Cards</h2>
          <span className="text-[11px] tabular-nums text-muted">({sideCardIds.length})</span>
        </div>
        <SegmentedControl
          aria-label="Side Cards layout"
          options={LAYOUT_OPTIONS}
          value={layout}
          onChange={onLayoutChange}
        />
      </div>

      {layout === "tabs" && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-canvas px-2 py-1.5 no-scrollbar">
          {sideCardIds.map((noteId) => {
            const entry = entries[noteId];
            const label = entry?.status === "ready" ? (noteFirstLine(entry.note.document) || "Untitled") : "Card";
            const active = currentActiveId === noteId;
            return (
              <div
                key={noteId}
                className={cn(
                  "flex max-w-[150px] shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11.5px]",
                  active ? "border-accent bg-surface font-medium text-ink" : "border-line bg-transparent text-muted hover:bg-tint/40",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => onSelectCard(noteId)}
                >
                  {label}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  className="shrink-0 rounded p-0.5 text-muted hover:text-danger"
                  onClick={() => onCloseCard(noteId)}
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
        {layout === "tabs" && currentActiveId ? (
          <div className="rounded-lg border border-line bg-surface p-3.5 space-y-2.5">
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                size="xs"
                variant={editingNoteId === currentActiveId ? "secondary" : "ghost"}
                onClick={() => setEditingNoteId(editingNoteId === currentActiveId ? null : currentActiveId)}
              >
                <Pencil size={11} aria-hidden="true" />
                <span>{editingNoteId === currentActiveId ? (savingNoteId === currentActiveId ? "Saving…" : "Done") : "Edit"}</span>
              </Button>
              {onOpenCardPage && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Open full card page"
                  onClick={() => onOpenCardPage(currentActiveId)}
                >
                  <Maximize2 size={11} aria-hidden="true" />
                  <span>Open</span>
                </Button>
              )}
              {onFocusNote && (
                <Button type="button" size="xs" variant="ghost" onClick={() => onFocusNote(currentActiveId)}>
                  <MapPin size={11} aria-hidden="true" />
                  <span>Focus</span>
                </Button>
              )}
              {onPlaceNote && activeWorkspaceId && (
                <Button type="button" size="xs" variant="ghost" onClick={() => onPlaceNote(currentActiveId)}>
                  <Plus size={11} aria-hidden="true" />
                  <span>Place</span>
                </Button>
              )}
            </div>
            {renderCardBody(currentActiveId)}
          </div>
        ) : (
          <div className="space-y-2.5">
            {sideCardIds.map((noteId) => {
              const entry = entries[noteId];
              const label = entry?.status === "ready" ? (noteFirstLine(entry.note.document) || "Untitled card") : "Loading card…";
              const folded = Boolean(foldedIds[noteId]);
              const isEditing = editingNoteId === noteId;
              return (
                <div
                  key={noteId}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-surface",
                    currentActiveId === noteId ? "border-accent/60" : "border-line",
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5 border-b border-line/70 px-2.5 py-1.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() => {
                        onSelectCard(noteId);
                        setFoldedIds((prev) => ({ ...prev, [noteId]: !prev[noteId] }));
                      }}
                    >
                      {folded
                        ? <ChevronRight size={13} className="shrink-0 text-muted" aria-hidden="true" />
                        : <ChevronDown size={13} className="shrink-0 text-muted" aria-hidden="true" />}
                      <span className="truncate text-[12.5px] font-semibold text-ink">{label}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {onOpenCardPage && (
                        <IconButton
                          type="button"
                          size="xs"
                          aria-label={`Open ${label} full page`}
                          title="Open card page"
                          onClick={() => onOpenCardPage(noteId)}
                        >
                          <Maximize2 size={12} aria-hidden="true" />
                        </IconButton>
                      )}
                      <IconButton
                        type="button"
                        size="xs"
                        aria-label={isEditing ? "Finish editing" : "Edit card"}
                        title={isEditing ? "Done" : "Edit"}
                        onClick={() => {
                          setFoldedIds((prev) => ({ ...prev, [noteId]: false }));
                          setEditingNoteId(isEditing ? null : noteId);
                        }}
                      >
                        <Pencil size={12} aria-hidden="true" />
                      </IconButton>
                      {onFocusNote && (
                        <IconButton
                          type="button"
                          size="xs"
                          aria-label={`Focus ${label}`}
                          title="Focus on Canvas"
                          onClick={() => onFocusNote(noteId)}
                        >
                          <MapPin size={12} aria-hidden="true" />
                        </IconButton>
                      )}
                      <IconButton
                        type="button"
                        size="xs"
                        aria-label={`Close ${label}`}
                        title="Close"
                        onClick={() => onCloseCard(noteId)}
                      >
                        <X size={12} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </div>
                  {!folded && (
                    <div className="p-3">
                      {renderCardBody(noteId)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
