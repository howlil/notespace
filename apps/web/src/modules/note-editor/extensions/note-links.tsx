import { type MouseEvent, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useReferencedCanvasNote } from "../use-note-store";
import { findBlockPreview } from "../model/note-extract";
import { noteFirstLine, type NoteDocument, type NoteNode } from "../../../entities/note";

function documentPreview(document: NoteDocument): string {
  if (document.type === "markdown") return noteFirstLine(document);
  const walk = (nodes: NoteNode[]): string[] => nodes.flatMap((node) => [
    ...(typeof node.text === "string" ? [node.text] : []),
    ...(node.content ? walk(node.content) : []),
  ]);
  return walk(document.content).join(" ").replace(/\s+/g, " ").trim();
}

function useReferencedNote(noteId: unknown) {
  const id = typeof noteId === "string" ? noteId : "";
  const entry = useReferencedCanvasNote(id);
  return {
    id,
    note: entry.status === "ready" ? entry.note : null,
    state: entry.status === "ready" ? "ready" : entry.status === "loading" ? "loading" : entry.status === "trashed" ? "trashed" : "missing",
  } as const;
}

function targetHref(workspaceId: unknown, noteId: string, blockId?: string) {
  if (typeof workspaceId !== "string" || !workspaceId) return undefined;
  const blockQuery = blockId ? `&blockId=${encodeURIComponent(blockId)}` : "";
  return `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(noteId)}${blockQuery}`;
}

function isUnmodifiedPrimaryClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/** Internal link using SPA navigation when inside TanStack Router so unsaved drafts flush cleanly. */
export function InternalNoteLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
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

type NoteEmbedCardProps = { noteId: unknown; workspaceId: unknown; label: unknown; blockId?: unknown };

/** Read-only embed preview shared by the editor node view and the static read view. */
export function NoteEmbedCard({ noteId, workspaceId, label, blockId }: NoteEmbedCardProps) {
  const { id, note, state } = useReferencedNote(noteId);
  const href = targetHref(workspaceId, id);
  const liveTitle = state === "ready" && note ? noteFirstLine(note.document) : "";
  const fallbackTitle = typeof label === "string" && label.trim() ? label : "Embedded Note";
  const title = liveTitle || fallbackTitle;
  const resolvedBlockId = typeof blockId === "string" && blockId ? blockId : undefined;
  return (
    <div className="my-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[12px] text-ink" data-note-embed={id} data-note-block-id={resolvedBlockId}>
      <div className="flex items-center justify-between gap-2">
        <strong className="font-semibold">{title}</strong>
        {href && <InternalNoteLink className="text-accent hover:underline" href={href}>Open</InternalNoteLink>}
      </div>
      <p className="m-0 mt-1 text-muted">
        {state === "loading" ? "Loading embedded Note…" : state === "trashed" ? "This Note is in Trash." : state === "missing" ? `Missing Note: ${id || "unknown"}` : documentPreview(note?.document ?? { type: "doc", content: [] }) || "Empty Note"}
      </p>
    </div>
  );
}

function NoteEmbedView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper contentEditable={false}>
      <NoteEmbedCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} label={node.attrs.label} blockId={node.attrs.blockId} />
    </NodeViewWrapper>
  );
}

type NoteBlockReferenceCardProps = { noteId: unknown; workspaceId: unknown; blockId: unknown; nodeBlockId?: unknown };

export function NoteBlockReferenceCard({ noteId, workspaceId, blockId: rawBlockId, nodeBlockId }: NoteBlockReferenceCardProps) {
  const { id, note, state } = useReferencedNote(noteId);
  const blockId = typeof rawBlockId === "string" ? rawBlockId : "";
  const preview = findBlockPreview(note?.document ?? null, blockId);
  const href = targetHref(workspaceId, id, blockId || undefined);
  const resolvedNodeBlockId = typeof nodeBlockId === "string" && nodeBlockId ? nodeBlockId : undefined;
  return (
    <div
      className="my-1.5 flex items-center gap-2 rounded-md border border-line bg-canvas/70 px-2.5 py-1.5 text-[12px] text-ink"
      data-note-block-ref={`${id}#${blockId}`}
      data-note-block-id={resolvedNodeBlockId}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-ink/90">
        {state === "loading" ? "Loading block reference…" : preview ?? `Missing block: ${blockId || "unknown"}`}
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

function BlockReferenceView({ node }: NodeViewProps) {
  return (
    <NodeViewWrapper contentEditable={false}>
      <NoteBlockReferenceCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} blockId={node.attrs.blockId} />
    </NodeViewWrapper>
  );
}

export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  draggable: true,

  renderMarkdown: (node: { attrs?: { src?: string; alt?: string } }) => {
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.replace(/[\r\n\]]/g, " ") : "";
    return src ? `![${alt}](${src})` : `[Image unavailable${alt ? `: ${alt}` : ""}]`;
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      assetId: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-notespace-note-image]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes({
      "data-notespace-note-image": "true",
      class: "max-h-64 w-full rounded-lg object-contain",
    }, HTMLAttributes)];
  },
});

export const NoteEmbed = Node.create({
  name: "noteEmbed",
  group: "block",
  atom: true,
  isolating: true,

  addAttributes() {
    return {
      noteId: { default: "" },
      workspaceId: { default: "" },
      label: { default: "Embedded Note" },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteEmbedView);
  },

  parseHTML() {
    return [{ tag: "div[data-note-embed]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, {
      "data-note-embed": node.attrs.noteId,
      "data-workspace-id": node.attrs.workspaceId,
    }), node.attrs.label || "Embedded Note"];
  },

  renderMarkdown: (node: { attrs?: { noteId?: string; workspaceId?: string } }) => {
    const noteId = typeof node.attrs?.noteId === "string" ? node.attrs.noteId : "";
    const workspaceId = typeof node.attrs?.workspaceId === "string" ? node.attrs.workspaceId : "";
    return noteId && workspaceId ? `[Embedded Note](/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(noteId)})` : `[Embedded Note: ${noteId || "unavailable"}]`;
  },
});

export const NoteBlockReference = Node.create({
  name: "noteBlockReference",
  group: "block",
  atom: true,
  isolating: true,

  addAttributes() {
    return {
      noteId: { default: "" },
      workspaceId: { default: "" },
      blockId: { default: "" },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockReferenceView);
  },

  parseHTML() {
    return [{ tag: "div[data-note-block-ref]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, {
      "data-note-block-ref": `${node.attrs.noteId}#${node.attrs.blockId}`,
      "data-workspace-id": node.attrs.workspaceId,
    }), `Block reference: ${node.attrs.blockId || "missing"}`];
  },

  renderMarkdown: (node: { attrs?: { noteId?: string; workspaceId?: string; blockId?: string } }) => {
    const noteId = typeof node.attrs?.noteId === "string" ? node.attrs.noteId : "";
    const workspaceId = typeof node.attrs?.workspaceId === "string" ? node.attrs.workspaceId : "";
    const blockId = typeof node.attrs?.blockId === "string" ? node.attrs.blockId : "";
    return noteId && blockId && workspaceId ? `[Block reference](/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(noteId)}&blockId=${encodeURIComponent(blockId)})` : `[Block reference: ${blockId || "unavailable"}]`;
  },
});
