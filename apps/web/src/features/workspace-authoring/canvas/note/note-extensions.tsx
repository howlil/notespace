import { Extension, Node, mergeAttributes, type Extensions, type JSONContent, type MarkdownRendererHelpers } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Mathematics from "@tiptap/extension-mathematics";
import { Markdown } from "@tiptap/markdown";
import { useReferencedCanvasNote } from "./use-canvas-note-store";
import { isValidNoteBlockId, NOTE_BLOCK_NODE_TYPES, noteBlockIdRepairs, type NoteDocument, type NoteNode } from "../../../../domain/note/note";

const blockNodeTypes = NOTE_BLOCK_NODE_TYPES;

function createBlockId() {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ensureNoteBlockIds(document: NoteDocument): NoteDocument {
  let changed = false;
  const seen = new Set<string>();
  const needsId = (node: NoteNode) => {
    if (!blockNodeTypes.has(node.type)) return false;
    const blockId = node.attrs?.blockId;
    if (!isValidNoteBlockId(blockId) || seen.has(blockId)) return true;
    seen.add(blockId);
    return false;
  };
  const visit = (nodes: NoteNode[]): NoteNode[] => {
    let next: NoteNode[] | null = null;
    nodes.forEach((node, index) => {
      const attrs = needsId(node) ? { ...(node.attrs ?? {}), blockId: createBlockId() } : node.attrs;
      const content = node.content ? visit(node.content) : undefined;
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
          // A split block is a new block: it must not inherit the original identity.
          keepOnSplit: false,
          parseHTML: (element: HTMLElement) => element.getAttribute("data-note-block-id"),
          renderHTML: (attributes: { blockId?: string | null }) => attributes.blockId ? { "data-note-block-id": attributes.blockId } : {},
        },
      },
    }];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("noteBlockIdentity"),
      // New, split, pasted or converted blocks get a fresh id in the same transaction group,
      // so a saved document always satisfies the server's present/valid/unique contract.
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some((transaction) => transaction.docChanged)) return null;
        const blocks: Array<{ key: number; type: string; blockId: unknown }> = [];
        newState.doc.descendants((node, pos) => {
          blocks.push({ key: pos, type: node.type.name, blockId: node.attrs.blockId });
        });
        const repairs = noteBlockIdRepairs(blocks);
        if (!repairs.length) return null;
        const tr = newState.tr;
        for (const pos of repairs) {
          const node = tr.doc.nodeAt(pos);
          if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: createBlockId() });
        }
        return tr;
      },
    })];
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
  const entry = useReferencedCanvasNote(id);
  return { id, note: entry.status === "ready" ? entry.note : null, state: entry.status === "ready" ? "ready" : entry.status === "loading" ? "loading" : "missing" } as const;
}

function targetHref(workspaceId: unknown, noteId: string) {
  if (typeof workspaceId !== "string" || !workspaceId) return undefined;
  return `/workspaces/${encodeURIComponent(workspaceId)}?noteId=${encodeURIComponent(noteId)}`;
}

type NoteEmbedCardProps = { noteId: unknown; workspaceId: unknown; label: unknown };

/** Read-only embed preview shared by the editor node view and the static read view. */
export function NoteEmbedCard({ noteId, workspaceId, label }: NoteEmbedCardProps) {
  const { id, note, state } = useReferencedNote(noteId);
  const href = targetHref(workspaceId, id);
  const title = typeof label === "string" && label.trim() ? label : "Embedded Note";
  return <div className="my-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[12px] text-ink" data-note-embed={id}>
    <div className="flex items-center justify-between gap-2">
      <strong className="font-semibold">{title}</strong>
      {href && <a className="text-accent hover:underline" href={href}>Open</a>}
    </div>
    <p className="m-0 mt-1 text-muted">
      {state === "loading" ? "Loading embedded Note…" : state === "missing" ? `Missing Note: ${id || "unknown"}` : documentPreview(note?.document ?? { type: "doc", content: [] }) || "Empty Note"}
    </p>
  </div>;
}

function NoteEmbedView({ node }: NodeViewProps) {
  return <NodeViewWrapper contentEditable={false}>
    <NoteEmbedCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} label={node.attrs.label} />
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

type NoteBlockReferenceCardProps = { noteId: unknown; workspaceId: unknown; blockId: unknown };

export function NoteBlockReferenceCard({ noteId, workspaceId, blockId: rawBlockId }: NoteBlockReferenceCardProps) {
  const { id, note, state } = useReferencedNote(noteId);
  const blockId = typeof rawBlockId === "string" ? rawBlockId : "";
  const preview = findBlockPreview(note?.document ?? null, blockId);
  const href = targetHref(workspaceId, id);
  return <div className="my-1 rounded border-l-2 border-accent/50 bg-tint/40 px-2 py-1 text-[12px] text-ink" data-note-block-ref={`${id}#${blockId}`}>
    <div className="flex items-center justify-between gap-2">
      <span>{state === "loading" ? "Loading block reference…" : preview ?? `Missing block: ${blockId || "unknown"}`}</span>
      {href && <a className="shrink-0 text-accent hover:underline" href={href}>Open</a>}
    </div>
  </div>;
}

function BlockReferenceView({ node }: NodeViewProps) {
  return <NodeViewWrapper contentEditable={false}>
    <NoteBlockReferenceCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} blockId={node.attrs.blockId} />
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

const calloutTones = new Set(["note", "info", "tip", "warning", "danger"]);

function calloutTone(value: unknown) {
  return typeof value === "string" && calloutTones.has(value) ? value : "note";
}

export const NoteCallout = Node.create({
  name: "noteCallout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      tone: { default: "note" },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-note-callout]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tone = calloutTone(node.attrs.tone);
    return ["aside", mergeAttributes(HTMLAttributes, {
      "data-note-callout": tone,
      "data-callout-tone": tone,
      class: `notespace-note-callout notespace-note-callout-${tone}`,
    }), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => {
    const tone = calloutTone(node.attrs?.tone).toUpperCase();
    const content = helpers.renderChildren(node.content ?? [], "\n\n").trim();
    const quoted = content.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
    return `> [!${tone}]${quoted ? `\n${quoted}` : ""}`;
  },
});

export const isSafeNoteLink = (url: string) => /^\/workspaces\/[^/]+(?:[?#/].*)?$/i.test(url) || /^https?:\/\//i.test(url);

/**
 * One schema for the editor and the read-only renderer. StarterKit's own Link/Underline are
 * disabled so the configured safe-link policy below is the only Link implementation.
 */
export function createNoteExtensions(): Extensions {
  return [
    StarterKit.configure({ link: false, underline: false }),
    NoteImage,
    NoteEmbed,
    NoteBlockReference,
    NoteCallout,
    NoteBlockIdentity,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ["http", "https"], isAllowedUri: (url, context) => isSafeNoteLink(url) && (url.startsWith("/") || context.defaultValidate(url)) }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Mathematics.configure({ katexOptions: { throwOnError: false, strict: false } }),
    Markdown,
  ];
}
