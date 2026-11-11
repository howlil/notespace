import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { getNote, type Note } from "../../../../adapters/http/note-api";
import type { NoteDocument, NoteNode } from "../../../../domain/note/note";

const blockNodeTypes = new Set(["paragraph", "heading", "blockquote", "codeBlock", "bulletList", "orderedList", "taskList", "table", "horizontalRule", "noteImage", "noteEmbed", "noteBlockReference"]);

function createBlockId() {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ensureNoteBlockIds(document: NoteDocument): NoteDocument {
  let changed = false;
  const visit = (nodes: NoteNode[]): NoteNode[] => {
    let next: NoteNode[] | null = null;
    nodes.forEach((node, index) => {
      const content = node.content ? visit(node.content) : undefined;
      const attrs = blockNodeTypes.has(node.type) && !node.attrs?.blockId
        ? { ...(node.attrs ?? {}), blockId: createBlockId() }
        : node.attrs;
      if (attrs === node.attrs && content === node.content) return;
      changed = true;
      next ??= nodes.slice();
      next[index] = { ...node, ...(attrs ? { attrs } : {}), ...(content ? { content } : {}) };
    });
    return next ?? nodes;
  };
  const content = visit(document.content);
  if (!changed) return document;
  return { ...document, content };
}

export const NoteBlockIdentity = Extension.create({
  name: "noteBlockIdentity",
  addGlobalAttributes() {
    return [{
      types: [...blockNodeTypes],
      attributes: {
        blockId: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-note-block-id"),
          renderHTML: (attributes: { blockId?: string | null }) => attributes.blockId ? { "data-note-block-id": attributes.blockId } : {},
        },
      },
    }];
  },
});

function documentPreview(document: NoteDocument): string {
  const walk = (nodes: NoteNode[]): string[] => nodes.flatMap((node) => [
    ...(typeof node.text === "string" ? [node.text] : []),
    ...(node.content ? walk(node.content) : []),
  ]);
  return walk(document.content).join(" ").replace(/\s+/g, " ").trim();
}

function useReferencedNote(noteId: unknown) {
  const id = typeof noteId === "string" ? noteId : "";
  const [note, setNote] = useState<Note | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">(id ? "loading" : "missing");
  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    setState("loading");
    void getNote(id).then((value) => {
      if (!active) return;
      setNote(value);
      setState("ready");
    }).catch(() => {
      if (active) setState("missing");
    });
    return () => { active = false; };
  }, [id]);
  return { id, note, state };
}

function targetHref(workspaceId: unknown, noteId: string) {
  if (typeof workspaceId !== "string" || !workspaceId) return undefined;
  return `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(noteId)}`;
}

function NoteEmbedView({ node }: NodeViewProps) {
  const { id, note, state } = useReferencedNote(node.attrs.noteId);
  const href = targetHref(node.attrs.workspaceId, id);
  const label = typeof node.attrs.label === "string" && node.attrs.label.trim() ? node.attrs.label : "Embedded Note";
  return <NodeViewWrapper className="my-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[11px] text-ink" contentEditable={false} data-note-embed={id}>
    <div className="flex items-center justify-between gap-2">
      <strong>{label}</strong>
      {href && <a className="text-accent hover:underline" href={href}>Open</a>}
    </div>
    <p className="m-0 mt-1 text-muted">
      {state === "loading" ? "Loading embedded Note…" : state === "missing" ? `Missing Note: ${id || "unknown"}` : documentPreview(note?.document ?? { type: "doc", content: [] }) || "Empty Note"}
    </p>
  </NodeViewWrapper>;
}

function findBlockPreview(document: NoteDocument | null, blockId: string): string | null {
  if (!document) return null;
  const visit = (nodes: NoteNode[]): string | null => {
    for (const node of nodes) {
      if (node.attrs?.blockId === blockId) return documentPreview({ type: "doc", content: [node] });
      const nested = node.content ? visit(node.content) : null;
      if (nested) return nested;
    }
    return null;
  };
  return visit(document.content);
}

function BlockReferenceView({ node }: NodeViewProps) {
  const { id, note, state } = useReferencedNote(node.attrs.noteId);
  const blockId = typeof node.attrs.blockId === "string" ? node.attrs.blockId : "";
  const preview = findBlockPreview(note?.document ?? null, blockId);
  const href = targetHref(node.attrs.workspaceId, id);
  return <NodeViewWrapper className="my-1 rounded border-l-2 border-accent/50 bg-tint/40 px-2 py-1 text-[11px] text-ink" contentEditable={false} data-note-block-ref={`${id}#${blockId}`}>
    <div className="flex items-center justify-between gap-2">
      <span>{state === "loading" ? "Loading block reference…" : preview ?? `Missing block: ${blockId || "unknown"}`}</span>
      {href && <a className="shrink-0 text-accent hover:underline" href={href}>Open</a>}
    </div>
  </NodeViewWrapper>;
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
