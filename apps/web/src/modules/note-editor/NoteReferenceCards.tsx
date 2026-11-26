import { type MouseEvent, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { noteFirstLine } from "../../entities/note";
import { findBlockPreview } from "./model/note-markdown";
import { useReferencedCanvasNote } from "./use-note-store";

function useReferencedNote(noteId: string) {
  const entry = useReferencedCanvasNote(noteId);
  return {
    note: entry.status === "ready" ? entry.note : null,
    state: entry.status === "ready" ? "ready" : entry.status === "loading" ? "loading" : entry.status === "trashed" ? "trashed" : "missing",
  } as const;
}

export function noteRouteHref(workspaceId: string, noteId: string, blockId?: string) {
  if (!workspaceId) return undefined;
  const blockQuery = blockId ? `&blockId=${encodeURIComponent(blockId)}` : "";
  return `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(noteId)}${blockQuery}`;
}

function isUnmodifiedPrimaryClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Internal link using SPA navigation when inside TanStack Router so unsaved drafts flush cleanly. */
export function InternalNoteLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter({ warn: false });
  const classes = className ? `pointer-events-auto ${className}` : "pointer-events-auto";
  return (
    <a
      href={href}
      className={classes}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (!router || event.defaultPrevented || !isUnmodifiedPrimaryClick(event)) return;
        event.preventDefault();
        event.stopPropagation();
        void router.navigate({ href });
      }}
    >
      {children}
    </a>
  );
}

/** Live preview of an embedded Note: `![label](/workspaces/<w>?noteId=<id>)`. */
export function NoteEmbedCard({ noteId, workspaceId, label, blockId }: { noteId: string; workspaceId: string; label: string; blockId?: string }) {
  const { note, state } = useReferencedNote(noteId);
  const href = noteRouteHref(workspaceId, noteId);
  const title = (state === "ready" && note ? noteFirstLine(note.document) : "") || label.trim() || "Embedded Note";
  return (
    <div className="my-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[12px] text-ink" data-note-embed={noteId} data-note-block-id={blockId}>
      <div className="flex items-center justify-between gap-2">
        <strong className="font-semibold">{title}</strong>
        {href && <InternalNoteLink className="text-accent hover:underline" href={href}>Open</InternalNoteLink>}
      </div>
      <p className="m-0 mt-1 text-muted">
        {state === "loading" ? "Loading embedded Note…" : state === "trashed" ? "This Note is in Trash." : state === "missing" ? `Missing Note: ${noteId}` : (note && noteFirstLine(note.document)) || "Empty Note"}
      </p>
    </div>
  );
}

/** Live preview of one block of another Note: `[…](/workspaces/<w>?noteId=<id>&blockId=<b>)`. */
export function NoteBlockReferenceCard({ noteId, workspaceId, blockId, ownBlockId }: { noteId: string; workspaceId: string; blockId: string; ownBlockId?: string }) {
  const { note, state } = useReferencedNote(noteId);
  const preview = findBlockPreview(note?.document ?? null, blockId);
  const href = noteRouteHref(workspaceId, noteId, blockId);
  return (
    <div
      className="my-1.5 flex items-center gap-2 rounded-md border border-line bg-canvas/70 px-2.5 py-1.5 text-[12px] text-ink"
      data-note-block-ref={`${noteId}#${blockId}`}
      data-note-block-id={ownBlockId}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-ink/90">
        {state === "loading" ? "Loading block reference…" : preview ?? `Missing block: ${blockId}`}
      </span>
      {href && (
        <InternalNoteLink
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted no-underline transition-colors hover:bg-tint hover:text-accent"
          href={href}
        >
          Open
        </InternalNoteLink>
      )}
    </div>
  );
}
