import { useCallback, useEffect, useMemo } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Note } from "../../../../platform/api/note-api";
import { noteFirstLine, readCanvasNoteReference, type NoteDocument } from "../../../../entities/note";
import {
  CanvasNoteStoreProvider,
  NoteEditor,
  NoteFocusModal,
  NoteInfoPopover,
  useCanvasNoteSnapshot,
  useCanvasNoteStore,
  type CanvasNoteStore,
  type NoteActivationPoint,
  type NoteCreatedConnection,
  type NoteSaveStatus,
} from "../../../note-editor";
import { CanvasNoteCard, NoteCardStatus, type CanvasViewport } from "./CanvasNoteCard";

export type { NoteActivationPoint, NoteCreatedConnection };

const ignoreAutoResize = () => {};

export function CanvasNoteCardLayer({
  elements,
  workspaceId,
  noteStore: externalNoteStore,
  viewport,
  selectedElementId,
  editingElementId,
  expandedElementId = null,
  infoNoteId = null,
  trashNoteId = null,
  activationPoint,
  highlightNoteId = null,
  highlightBlockId = null,
  onEditingChange,
  onExpandedChange,
  onInfoNoteChange,
  onTrashNoteChange,
  onFocusNote,
  onRegisterFlush,
  onRegisterDocuments,
  onUpdateNote,
  onSaveState,
  onAutoResize,
  onRemoveMissing,
  onPlaceLinkedNote,
  onExtractToNote,
  onCreateAndLinkNote,
  onSuccess,
  onError,
}: {
  elements: readonly OrderedExcalidrawElement[];
  workspaceId: string;
  noteStore?: CanvasNoteStore;
  viewport: CanvasViewport;
  selectedElementId: string | null;
  editingElementId: string | null;
  expandedElementId?: string | null;
  infoNoteId?: string | null;
  trashNoteId?: string | null;
  activationPoint?: NoteActivationPoint | null;
  highlightNoteId?: string | null;
  highlightBlockId?: string | null;
  onEditingChange: (elementId: string | null) => void;
  onExpandedChange?: (elementId: string | null) => void;
  onInfoNoteChange?: (noteId: string | null) => void;
  onTrashNoteChange?: (noteId: string | null) => void;
  onFocusNote?: (noteId: string) => void;
  onRegisterFlush?: (flush: () => Promise<void>) => (() => void) | void;
  onRegisterDocuments?: (read: () => Record<string, NoteDocument>) => (() => void) | void;
  onUpdateNote: (noteId: string, document: NoteDocument, expectedRevision: number) => Promise<Note>;
  onSaveState?: (status: NoteSaveStatus) => void;
  onAutoResize?: (elementId: string, height: number) => void;
  onRemoveMissing?: (elementId: string) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onExtractToNote?: (sourceElementId: string, extractedDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onSuccess?: (message: string) => void;
  onError: (message: string) => void;
}) {
  const fallbackStore = useCanvasNoteStore({ updateNote: onUpdateNote });
  const store = externalNoteStore ?? fallbackStore;
  const snapshot = useCanvasNoteSnapshot(store);
  const noteElements = useMemo(() => elements.flatMap((element) => {
    const reference = readCanvasNoteReference(element);
    return reference ? [{ element, reference }] : [];
  }), [elements]);

  useEffect(() => {
    store.ensure(noteElements.map(({ reference }) => reference.noteId));
  }, [noteElements, store]);
  useEffect(() => { onSaveState?.(snapshot.save); }, [onSaveState, snapshot.save]);

  const restoreNote = useCallback((noteId: string) => {
    store.restore(noteId).then(
      () => onSuccess?.("Note restored."),
      (error: unknown) => onError(error instanceof Error && error.message ? error.message : "Could not restore this Note."),
    );
  }, [store, onSuccess, onError]);
  useEffect(() => {
    if (!trashNoteId) return;
    let active = true;
    store.trash(trashNoteId).then(
      () => { if (active) onSuccess?.("Note moved to Trash. Restore it from the card or Settings."); },
      (error: unknown) => { if (active) onError(error instanceof Error && error.message ? error.message : "Could not move this Note to Trash."); },
    ).finally(() => { if (active) onTrashNoteChange?.(null); });
    return () => { active = false; };
  }, [trashNoteId, store, onSuccess, onError, onTrashNoteChange]);
  useEffect(() => onRegisterFlush?.(() => store.flushAll()), [onRegisterFlush, store]);
  useEffect(() => onRegisterDocuments?.(() => store.getDocuments()), [onRegisterDocuments, store]);

  const expandedTarget = useMemo(
    () => (expandedElementId ? noteElements.find(({ element }) => element.id === expandedElementId) ?? null : null),
    [expandedElementId, noteElements],
  );
  useEffect(() => {
    if (expandedElementId && !expandedTarget) onExpandedChange?.(null);
  }, [expandedElementId, expandedTarget, onExpandedChange]);

  const expandedEntry = expandedTarget
    ? (snapshot.entries[expandedTarget.reference.noteId] ?? { status: "loading" as const })
    : null;
  const expandedReadyNote = expandedEntry?.status === "ready" ? expandedEntry.note : null;

  const infoEntry = infoNoteId ? snapshot.entries[infoNoteId] : undefined;
  const infoNoteLabel = infoEntry?.status === "ready" ? noteFirstLine(infoEntry.note.document) : undefined;

  return (
    <CanvasNoteStoreProvider value={store}>
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-visible" aria-label="Canvas notes">
        {noteElements.map(({ element, reference }) => (
          <CanvasNoteCard
            key={element.id}
            element={element}
            reference={reference}
            entry={snapshot.entries[reference.noteId] ?? { status: "loading" }}
            saveState={snapshot.saves[reference.noteId]}
            workspaceId={workspaceId}
            viewport={viewport}
            selected={selectedElementId === element.id}
            editing={editingElementId === element.id}
            expanded={expandedElementId === element.id}
            activationPoint={editingElementId === element.id ? activationPoint : null}
            highlightBlockId={highlightNoteId === reference.noteId ? highlightBlockId : null}
            onEditingChange={onEditingChange}
            onExpand={onExpandedChange ? (elementId) => onExpandedChange(elementId) : undefined}
            onDocumentChange={store.queue}
            readDocument={store.readDocument}
            onRetry={store.retry}
            onRestore={restoreNote}
            onRemoveMissing={onRemoveMissing}
            onAutoResize={onAutoResize ?? ignoreAutoResize}
            onPlaceLinkedNote={onPlaceLinkedNote}
            onExtractToNote={onExtractToNote}
            onCreateAndLinkNote={onCreateAndLinkNote}
            onSuccess={onSuccess}
            onError={onError}
          />
        ))}
      </div>
      {expandedTarget && expandedEntry && (
        <NoteFocusModal
          open={Boolean(expandedTarget) && !infoNoteId}
          onOpenChange={(open) => {
            if (!open) onExpandedChange?.(null);
          }}
          label={expandedReadyNote ? noteFirstLine(expandedReadyNote.document) : undefined}
          saveState={expandedReadyNote ? (snapshot.saves[expandedReadyNote.id] ?? "saved") : "saved"}
          onOpenInfo={onInfoNoteChange && expandedReadyNote ? () => onInfoNoteChange(expandedReadyNote.id) : undefined}
        >
          {expandedEntry.status === "ready" ? (
            <NoteEditor
              key={expandedTarget.element.id}
              note={expandedEntry.note}
              elementId={expandedTarget.element.id}
              workspaceId={workspaceId}
              bodyMaxHeight={undefined}
              onDocumentChange={(document) => store.queue(expandedEntry.note.id, document)}
              readDocument={store.readDocument}
              onAutoResize={ignoreAutoResize}
              onPlaceLinkedNote={onPlaceLinkedNote}
              onExtractToNote={onExtractToNote}
              onCreateAndLinkNote={onCreateAndLinkNote}
              onSuccess={onSuccess}
              onError={onError}
              onEscape={() => onExpandedChange?.(null)}
            />
          ) : (
            <NoteCardStatus
              entry={expandedEntry}
              onRetry={() => store.retry(expandedTarget.reference.noteId)}
              onRestore={() => restoreNote(expandedTarget.reference.noteId)}
              onRemoveMissing={onRemoveMissing ? () => {
                onExpandedChange?.(null);
                onRemoveMissing(expandedTarget.element.id);
              } : undefined}
            />
          )}
        </NoteFocusModal>
      )}
      <NoteInfoPopover
        open={Boolean(infoNoteId)}
        onOpenChange={(open) => {
          if (!open) onInfoNoteChange?.(null);
        }}
        noteId={infoNoteId}
        noteLabel={infoNoteLabel}
        currentWorkspaceId={workspaceId}
        onFocusNote={onFocusNote}
      />
    </CanvasNoteStoreProvider>
  );
}
