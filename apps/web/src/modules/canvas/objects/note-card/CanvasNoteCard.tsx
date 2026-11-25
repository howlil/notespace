import { Maximize2 } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Note } from "../../../../platform/api/note-api";
import { noteFirstLine, type CanvasNoteReference, type NoteDocument } from "../../../../entities/note";
import {
  NoteEditor,
  NoteReadView,
  toggleNoteToggleInDocument,
  toggleTaskInDocument,
  type CanvasNoteEntry,
  type NoteActivationPoint,
  type NoteCreatedConnection,
  type NoteSaveState,
} from "../../../note-editor";
import {
  NOTE_CARD_MIN_HEIGHT,
  noteCardBodyMaxHeight,
  noteCardDetail,
  noteCardFrame,
  noteCardLabelFontSize,
  type NoteCardDetail,
} from "./model/note-card-layout";

export type CanvasViewport = { zoom: number; scrollX: number; scrollY: number };

export function NoteCardStatus({
  entry,
  onRetry,
  onRemoveMissing,
  onRestore,
}: {
  entry: Exclude<CanvasNoteEntry, { status: "ready" }>;
  onRetry: () => void;
  onRemoveMissing?: () => void;
  onRestore?: () => void;
}) {
  if (entry.status === "trashed") {
    return (
      <div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="status">
        <span>This Note is in Trash.</span>
        <div className="flex flex-wrap gap-1.5">
          {onRestore && (
            <button type="button" className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-accent hover:bg-tint" onClick={onRestore}>
              Restore
            </button>
          )}
          {onRemoveMissing && (
            <button type="button" className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-danger hover:bg-tint" onClick={onRemoveMissing}>
              Remove from canvas
            </button>
          )}
        </div>
      </div>
    );
  }
  if (entry.status === "loading") {
    return (
      <div className="grid content-start gap-2 px-3.5 py-3" aria-busy="true" aria-label="Loading Note">
        <span className="h-2.5 w-3/5 rounded bg-tint" />
        <span className="h-2.5 w-4/5 rounded bg-tint" />
        <span className="h-2.5 w-2/5 rounded bg-tint" />
      </div>
    );
  }
  if (entry.status === "missing") {
    return (
      <div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="status">
        <span>This Note is no longer available.</span>
        {onRemoveMissing && (
          <button
            type="button"
            className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-danger hover:bg-tint"
            onClick={onRemoveMissing}
          >
            Remove from canvas
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1.5 px-3.5 py-2.5 text-[13px] leading-5 text-muted" role="alert">
      <span>{entry.message}</span>
      <button type="button" className="pointer-events-auto rounded-md border border-line px-2 py-0.5 text-[12px] text-accent hover:bg-tint" onClick={onRetry}>Retry</button>
    </div>
  );
}

const saveIndicatorLabel: Partial<Record<NoteSaveState, string>> = {
  pending: "Unsaved changes",
  saving: "Saving",
  error: "Save failed",
  conflict: "Save conflict",
};

function NoteSaveIndicator({ state }: { state: NoteSaveState | undefined }) {
  const label = state ? saveIndicatorLabel[state] : undefined;
  if (!state || !label) return null;
  const failed = state === "error" || state === "conflict";
  return <span className={"notespace-note-ui pointer-events-none absolute right-2 top-2 size-1.5 rounded-full " + (failed ? "bg-danger" : "bg-muted/50")} data-note-save={state} title={label} {...(failed ? { role: "img", "aria-label": label } : { "aria-hidden": true })} />;
}

function NoteLabel({ document, zoom, lines }: { document: NoteDocument; zoom: number; lines: 1 | 2 }) {
  const label = noteFirstLine(document);
  return <p className={"m-0 px-3.5 py-2.5 font-semibold leading-tight text-ink " + (lines === 1 ? "truncate" : "line-clamp-2")} style={{ fontSize: noteCardLabelFontSize(zoom, lines === 1) }} data-note-label="">{label}</p>;
}

export type CanvasNoteCardProps = {
  element: OrderedExcalidrawElement;
  reference: CanvasNoteReference;
  entry: CanvasNoteEntry;
  saveState: NoteSaveState | undefined;
  workspaceId: string;
  viewport: CanvasViewport;
  selected: boolean;
  editing: boolean;
  expanded: boolean;
  activationPoint?: NoteActivationPoint | null;
  highlightBlockId?: string | null;
  onEditingChange: (elementId: string | null) => void;
  onExpand?: (elementId: string) => void;
  onDocumentChange: (noteId: string, document: NoteDocument) => void;
  readDocument: (noteId: string) => NoteDocument | undefined;
  onRetry: (noteId: string) => void;
  onRestore?: (noteId: string) => void;
  onRemoveMissing?: (elementId: string) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onPlaceLinkedNote?: (noteId: string) => Promise<void> | void;
  onExtractToNote?: (sourceElementId: string, extractedDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onCreateAndLinkNote?: (sourceElementId: string, initialDocument: NoteDocument) => Promise<NoteCreatedConnection | null>;
  onSuccess?: (message: string) => void;
  onError: (message: string) => void;
};

function NoteCardBody({
  elementId,
  entry,
  editable,
  folded,
  detail,
  zoom,
  bodyMaxHeight,
  highlightBlockId,
  onDocumentChange,
  onAutoResize,
  onRetry,
  onRemoveMissing,
  onRestore,
  renderEditor,
}: {
  elementId: string;
  entry: CanvasNoteEntry;
  editable: boolean;
  folded: boolean;
  detail: NoteCardDetail;
  zoom: number;
  bodyMaxHeight?: number;
  highlightBlockId?: string | null;
  onDocumentChange: (noteId: string, document: NoteDocument) => void;
  onAutoResize: (elementId: string, height: number) => void;
  onRetry: () => void;
  onRemoveMissing?: () => void;
  onRestore?: () => void;
  renderEditor: (note: Note) => ReactNode;
}) {
  const readScrollRef = useRef<HTMLDivElement>(null);
  const readAutoFitActive = !editable && !folded && detail !== "label" && entry.status === "ready";
  const readyDocument = entry.status === "ready" ? entry.note.document : null;

  useEffect(() => {
    if (!readAutoFitActive || typeof ResizeObserver === "undefined") return;
    const contentNode = readScrollRef.current?.querySelector<HTMLElement>(".notespace-note-content");
    if (!contentNode) return;
    const reportSize = () => {
      onAutoResize(elementId, Math.max(NOTE_CARD_MIN_HEIGHT, Math.ceil(contentNode.scrollHeight + 24)));
    };
    reportSize();
    const observer = new ResizeObserver(reportSize);
    observer.observe(contentNode);
    return () => observer.disconnect();
  }, [readAutoFitActive, elementId, onAutoResize, readyDocument]);

  if (entry.status !== "ready") return <NoteCardStatus entry={entry} onRetry={onRetry} onRemoveMissing={onRemoveMissing} onRestore={onRestore} />;
  if (editable) return renderEditor(entry.note);
  if (folded) return <NoteLabel document={entry.note.document} zoom={zoom} lines={1} />;
  if (detail === "label") return <NoteLabel document={entry.note.document} zoom={zoom} lines={2} />;
  const readyNote = entry.note;
  const document = readyNote.document;
  return (
    <div
      ref={readScrollRef}
      data-note-scroll=""
      className="no-scrollbar overflow-y-auto overscroll-contain"
      style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : undefined}
    >
      <NoteReadView
        document={document}
        highlightBlockId={highlightBlockId}
        onToggleTask={document.type === "doc" ? (target) => {
          const nextDoc = toggleTaskInDocument(document, target);
          if (nextDoc !== document) onDocumentChange(readyNote.id, nextDoc);
        } : undefined}
        onToggleCollapse={document.type === "doc" ? (blockId, open) => {
          const nextDoc = toggleNoteToggleInDocument(document, blockId, open);
          if (nextDoc !== document) onDocumentChange(readyNote.id, nextDoc);
        } : undefined}
      />
    </div>
  );
}

export function CanvasNoteCard({
  element,
  reference,
  entry,
  saveState,
  workspaceId,
  viewport,
  selected,
  editing,
  expanded,
  activationPoint,
  highlightBlockId,
  onEditingChange,
  onExpand,
  onDocumentChange,
  readDocument,
  onRetry,
  onRestore,
  onRemoveMissing,
  onAutoResize,
  onPlaceLinkedNote,
  onExtractToNote,
  onCreateAndLinkNote,
  onSuccess,
  onError,
}: CanvasNoteCardProps) {
  const folded = reference.compact === true;
  const editable = editing && !expanded && entry.status === "ready";
  const detail = noteCardDetail(viewport.zoom, editable);
  const zoomCollapsed = detail === "label" && !editable;
  const collapsed = (folded || zoomCollapsed) && !editable;
  const frame = noteCardFrame(element, viewport, collapsed);
  const bodyMaxHeight = noteCardBodyMaxHeight(element.height, collapsed, reference.heightMode);
  const style = {
    ...frame,
    ...(!collapsed && (reference.heightMode === "fixed" || !editable) ? { height: element.height } : {}),
  } as CSSProperties;
  const frameClass = "absolute border bg-surface text-ink transition-[height,min-height] duration-200 ease-out motion-reduce:transition-none "
    + (reference.shape === "square" ? "rounded-none " : "rounded-lg ")
    + (collapsed ? "overflow-hidden " : "overflow-visible ")
    + (selected || editable ? "border-accent/70 ring-2 ring-accent/15" : "border-line")
    + (editable ? " pointer-events-auto" : " pointer-events-none");

  return (
    <article
      className={frameClass}
      style={style}
      data-note-element={element.id}
      data-note-compact={folded || undefined}
      data-note-height-mode={reference.heightMode ?? "auto"}
      data-note-color={reference.color && reference.color !== "default" ? reference.color : undefined}
      data-note-shape={reference.shape === "square" ? "square" : undefined}
      data-note-selected={selected ? "true" : undefined}
      data-note-editing={editable ? "true" : undefined}
      data-note-state={entry.status}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => { if (event.key === "Escape") onEditingChange(null); }}
    >
      {editable && viewport.zoom < 0.75 && onExpand && (
        <button
          type="button"
          className="notespace-note-ui pointer-events-auto absolute right-0 bottom-full z-10 mb-1 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted hover:bg-tint hover:text-accent"
          aria-label="Expand Note"
          title="Expand Note (Shift+Enter)"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onExpand(element.id);
          }}
        >
          <Maximize2 className="size-3" aria-hidden="true" />
          <span>Expand</span>
        </button>
      )}
      <NoteCardBody
        elementId={element.id}
        entry={entry}
        editable={editable}
        folded={collapsed}
        detail={detail}
        zoom={viewport.zoom}
        bodyMaxHeight={bodyMaxHeight}
        highlightBlockId={highlightBlockId}
        onDocumentChange={onDocumentChange}
        onAutoResize={onAutoResize}
        onRetry={() => onRetry(reference.noteId)}
        onRemoveMissing={onRemoveMissing ? () => onRemoveMissing(element.id) : undefined}
        onRestore={onRestore ? () => onRestore(reference.noteId) : undefined}
        renderEditor={(note) => (
          <NoteEditor
            note={note}
            elementId={element.id}
            workspaceId={workspaceId}
            minHeight={NOTE_CARD_MIN_HEIGHT}
            activationPoint={activationPoint}
            bodyMaxHeight={bodyMaxHeight}
            onDocumentChange={(document) => onDocumentChange(note.id, document)}
            readDocument={readDocument}
            onAutoResize={onAutoResize}
            onPlaceLinkedNote={onPlaceLinkedNote}
            onExtractToNote={onExtractToNote}
            onCreateAndLinkNote={onCreateAndLinkNote}
            onSuccess={onSuccess}
            onError={onError}
            onEscape={() => onEditingChange(null)}
          />
        )}
      />
      <NoteSaveIndicator state={saveState} />
    </article>
  );
}
