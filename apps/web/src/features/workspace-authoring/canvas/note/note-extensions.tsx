import { type MouseEvent, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  Extension,
  Mark,
  Node,
  mergeAttributes,
  type Extensions,
  type JSONContent,
  type MarkdownRendererHelpers,
} from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Mathematics from "@tiptap/extension-mathematics";
import { Markdown } from "@tiptap/markdown";
import { useReferencedCanvasNote } from "./use-canvas-note-store";
import { findBlockById, listNoteBlocks, type NoteBlockSummary } from "./note-extract";
import {
  isSafeNoteLink,
  isValidNoteBlockId,
  NOTE_BLOCK_NODE_TYPES,
  NOTE_HIGHLIGHT_TONES,
  NOTE_TEXT_COLOR_TONES,
  noteBlockIdRepairs,
  noteFirstLine,
  type NoteDocument,
  type NoteHighlightTone,
  type NoteNode,
  type NoteTextColorTone,
} from "../../../../domain/note/note";

export { findBlockById, isSafeNoteLink, listNoteBlocks, type NoteBlockSummary };

export type NoteMathEditRequest = {
  pos: number;
  latex: string;
  block: boolean;
};

export type CreateNoteExtensionsOptions = {
  onEditMath?: (info: NoteMathEditRequest) => void;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteToggle: {
      insertNoteToggle: (options?: { summary?: string; open?: boolean }) => ReturnType;
    };
    noteHighlight: {
      setNoteHighlight: (tone?: NoteHighlightTone) => ReturnType;
      toggleNoteHighlight: (tone?: NoteHighlightTone) => ReturnType;
      unsetNoteHighlight: () => ReturnType;
    };
    noteTextColor: {
      setNoteTextColor: (tone: NoteTextColorTone) => ReturnType;
      unsetNoteTextColor: () => ReturnType;
    };
  }
}

const blockNodeTypes = NOTE_BLOCK_NODE_TYPES;
const highlightToneSet: ReadonlySet<string> = new Set(NOTE_HIGHLIGHT_TONES);
const textColorToneSet: ReadonlySet<string> = new Set(NOTE_TEXT_COLOR_TONES);

export function normalizeHighlightTone(value: unknown): NoteHighlightTone {
  return typeof value === "string" && highlightToneSet.has(value) ? (value as NoteHighlightTone) : "yellow";
}

export function normalizeTextColorTone(value: unknown): NoteTextColorTone | null {
  return typeof value === "string" && textColorToneSet.has(value) ? (value as NoteTextColorTone) : null;
}

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

const NoteBlockIdentity = Extension.create({
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

const placeholderPluginKey = new PluginKey<{ focused: boolean }>("notePlaceholder");
const NOTE_PLACEHOLDER_TEXT = "Write a note, or type / for commands…";

/** Shows a CSS-only placeholder decoration on an empty focused/editable Note without mutating document text. */
const NotePlaceholder = Extension.create({
  name: "notePlaceholder",
  addProseMirrorPlugins() {
    return [
      new Plugin<{ focused: boolean }>({
        key: placeholderPluginKey,
        state: {
          init: () => ({ focused: false }),
          apply: (tr, value) => {
            const meta = tr.getMeta(placeholderPluginKey) as { focused?: boolean } | undefined;
            return typeof meta?.focused === "boolean" ? { focused: meta.focused } : value;
          },
        },
        props: {
          handleDOMEvents: {
            focus: (view) => {
              const current = placeholderPluginKey.getState(view.state);
              if (!current?.focused) {
                view.dispatch(
                  view.state.tr
                    .setMeta(placeholderPluginKey, { focused: true })
                    .setMeta("addToHistory", false),
                );
              }
              return false;
            },
            blur: (view) => {
              const current = placeholderPluginKey.getState(view.state);
              if (current?.focused) {
                view.dispatch(
                  view.state.tr
                    .setMeta(placeholderPluginKey, { focused: false })
                    .setMeta("addToHistory", false),
                );
              }
              return false;
            },
          },
          decorations: (state) => {
            if (!this.editor.isEditable) return DecorationSet.empty;
            const pluginState = placeholderPluginKey.getState(state);
            const focused = pluginState?.focused || this.editor.isFocused;
            if (!focused) return DecorationSet.empty;
            const { doc } = state;
            const first = doc.firstChild;
            if (
              doc.childCount !== 1
              || !first
              || first.type.name !== "paragraph"
              || first.content.size > 0
            ) {
              return DecorationSet.empty;
            }
            return DecorationSet.create(doc, [
              Decoration.node(0, first.nodeSize, {
                class: "notespace-note-empty",
                "data-placeholder": NOTE_PLACEHOLDER_TEXT,
              }),
            ]);
          },
        },
      }),
    ];
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
  return { id, note: entry.status === "ready" ? entry.note : null, state: entry.status === "ready" ? "ready" : entry.status === "loading" ? "loading" : entry.status === "trashed" ? "trashed" : "missing" } as const;
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
  return <div className="my-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[12px] text-ink" data-note-embed={id} data-note-block-id={resolvedBlockId}>
    <div className="flex items-center justify-between gap-2">
      <strong className="font-semibold">{title}</strong>
      {href && <InternalNoteLink className="text-accent hover:underline" href={href}>Open</InternalNoteLink>}
    </div>
    <p className="m-0 mt-1 text-muted">
      {state === "loading" ? "Loading embedded Note…" : state === "trashed" ? "This Note is in Trash." : state === "missing" ? `Missing Note: ${id || "unknown"}` : documentPreview(note?.document ?? { type: "doc", content: [] }) || "Empty Note"}
    </p>
  </div>;
}

function NoteEmbedView({ node }: NodeViewProps) {
  return <NodeViewWrapper contentEditable={false}>
    <NoteEmbedCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} label={node.attrs.label} blockId={node.attrs.blockId} />
  </NodeViewWrapper>;
}

function findBlockPreview(document: NoteDocument | null, blockId: string): string | null {
  const block = findBlockById(document, blockId);
  if (!block) return null;
  return documentPreview({ type: "doc", content: [block] });
}

type NoteBlockReferenceCardProps = { noteId: unknown; workspaceId: unknown; blockId: unknown; nodeBlockId?: unknown };

export function NoteBlockReferenceCard({ noteId, workspaceId, blockId: rawBlockId, nodeBlockId }: NoteBlockReferenceCardProps) {
  const { id, note, state } = useReferencedNote(noteId);
  const blockId = typeof rawBlockId === "string" ? rawBlockId : "";
  const preview = findBlockPreview(note?.document ?? null, blockId);
  const href = targetHref(workspaceId, id, blockId || undefined);
  const resolvedNodeBlockId = typeof nodeBlockId === "string" && nodeBlockId ? nodeBlockId : undefined;
  return <div className="my-1 rounded border-l-2 border-accent/50 bg-tint/40 px-2 py-1 text-[12px] text-ink" data-note-block-ref={`${id}#${blockId}`} data-note-block-id={resolvedNodeBlockId}>
    <div className="flex items-center justify-between gap-2">
      <span>{state === "loading" ? "Loading block reference…" : preview ?? `Missing block: ${blockId || "unknown"}`}</span>
      {href && <InternalNoteLink className="shrink-0 text-accent hover:underline" href={href}>Open</InternalNoteLink>}
    </div>
  </div>;
}

function BlockReferenceView({ node }: NodeViewProps) {
  return <NodeViewWrapper contentEditable={false}>
    <NoteBlockReferenceCard noteId={node.attrs.noteId} workspaceId={node.attrs.workspaceId} blockId={node.attrs.blockId} />
  </NodeViewWrapper>;
}

const NoteImage = Node.create({
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

const NoteEmbed = Node.create({
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

const NoteBlockReference = Node.create({
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

const CALLOUT_TONES = ["note", "info", "tip", "warning", "danger"] as const;
const calloutTones: ReadonlySet<string> = new Set(CALLOUT_TONES);

function calloutTone(value: unknown) {
  return typeof value === "string" && calloutTones.has(value) ? value : "note";
}

function NoteCalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const tone = calloutTone(node.attrs.tone);
  const blockId = typeof node.attrs.blockId === "string" && node.attrs.blockId ? node.attrs.blockId : undefined;
  return (
    <NodeViewWrapper
      as="aside"
      data-note-callout={tone}
      data-callout-tone={tone}
      data-note-block-id={blockId}
      className={`notespace-note-callout notespace-note-callout-${tone}`}
    >
      {editor.isEditable && (
        <div
          contentEditable={false}
          className="notespace-note-callout-tones mb-1 flex justify-end"
          role="group"
          aria-label="Callout tone"
        >
          <div className="inline-flex items-center gap-0.5 rounded-md border border-line/80 bg-surface/90 p-0.5">
            {CALLOUT_TONES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={
                  "rounded px-1.5 py-0.5 text-[9px] font-medium capitalize leading-none transition-colors "
                  + (candidate === tone
                    ? "bg-tint text-accent"
                    : "text-muted hover:bg-tint hover:text-ink")
                }
                aria-pressed={candidate === tone}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  updateAttributes({ tone: candidate });
                }}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>
      )}
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

const NoteCallout = Node.create({
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

  addNodeView() {
    return ReactNodeViewRenderer(NoteCalloutView);
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

/**
 * Interactive Toggle NodeView: renders a `<div>` (not `<details>`) in the live DOM so
 * `NativePopupManager`'s global `<details[open]>` auto-closer never collapses Note toggles.
 */
function NoteToggleView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open !== false;
  const blockId = typeof node.attrs.blockId === "string" && node.attrs.blockId ? node.attrs.blockId : undefined;
  return (
    <NodeViewWrapper
      as="div"
      className="notespace-note-toggle"
      data-note-toggle=""
      data-open={open ? "true" : "false"}
      data-note-block-id={blockId}
    >
      <button
        type="button"
        contentEditable={false}
        className="notespace-note-toggle-trigger"
        aria-expanded={open}
        aria-label={open ? "Collapse toggle" : "Expand toggle"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          updateAttributes({ open: !open });
        }}
      >
        <ChevronRight
          className={"size-3.5 transition-transform duration-100 " + (open ? "rotate-90" : "")}
          aria-hidden="true"
        />
      </button>
      <NodeViewContent className="notespace-note-toggle-content" />
    </NodeViewWrapper>
  );
}

const NoteToggleSummary = Node.create({
  name: "noteToggleSummary",
  content: "inline*",
  defining: true,
  isolating: true,

  parseHTML() {
    return [
      { tag: "summary[data-note-toggle-summary]" },
      { tag: "div[data-note-toggle-summary]" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["summary", mergeAttributes(HTMLAttributes, {
      "data-note-toggle-summary": "",
      class: "notespace-note-toggle-summary",
    }), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => helpers.renderChildren(node.content ?? [], ""),

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state, dispatch } = this.editor.view;
        const { $from } = state.selection;
        if ($from.parent.type.name !== this.name) return false;
        const toggleDepth = $from.depth - 1;
        if (toggleDepth < 0 || $from.node(toggleDepth).type.name !== "noteToggle") return false;
        const togglePos = $from.before(toggleDepth);
        const toggleNode = $from.node(toggleDepth);
        const summaryAfter = $from.after($from.depth);
        const tr = state.tr;
        if (toggleNode.attrs.open === false) {
          tr.setNodeMarkup(togglePos, undefined, { ...toggleNode.attrs, open: true });
        }
        const targetPos = Math.min(tr.doc.content.size, summaryAfter + 1);
        tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)));
        dispatch(tr.scrollIntoView());
        return true;
      },
      Backspace: () => {
        const { state, dispatch } = this.editor.view;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if ($from.parent.type.name !== this.name || $from.parentOffset !== 0) return false;
        const toggleDepth = $from.depth - 1;
        if (toggleDepth < 0 || $from.node(toggleDepth).type.name !== "noteToggle") return false;
        const toggleNode = $from.node(toggleDepth);
        const isOnlyEmptyBody = toggleNode.childCount === 2
          && toggleNode.child(1).type.name === "paragraph"
          && toggleNode.child(1).content.size === 0;
        if (toggleNode.textContent.trim().length > 0 || !isOnlyEmptyBody) return false;
        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;
        const togglePos = $from.before(toggleDepth);
        const tr = state.tr.replaceWith(togglePos, togglePos + toggleNode.nodeSize, paragraphType.create());
        tr.setSelection(TextSelection.near(tr.doc.resolve(togglePos + 1)));
        dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});

const NoteToggle = Node.create({
  name: "noteToggle",
  group: "block",
  content: "noteToggleSummary block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element: HTMLElement) => {
          if (element.hasAttribute("data-open")) return element.getAttribute("data-open") !== "false";
          return element.hasAttribute("open");
        },
        renderHTML: (attributes: { open?: boolean }) => {
          const open = attributes.open !== false;
          return {
            "data-open": open ? "true" : "false",
            ...(open ? { open: "" } : {}),
          };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteToggleView);
  },

  addCommands() {
    return {
      insertNoteToggle:
        (options) =>
        ({ state, dispatch }) => {
          const toggleType = state.schema.nodes.noteToggle;
          const summaryType = state.schema.nodes.noteToggleSummary;
          const paragraphType = state.schema.nodes.paragraph;
          if (!toggleType || !summaryType || !paragraphType) return false;
          const summaryNode = summaryType.create(
            null,
            options?.summary ? state.schema.text(options.summary) : undefined,
          );
          const toggleNode = toggleType.create(
            { open: options?.open ?? true },
            [summaryNode, paragraphType.create()],
          );
          if (!dispatch) return true;
          const { from, to, $from } = state.selection;
          const replaceEmptyParagraph = $from.parent.type === paragraphType
            && $from.parent.content.size === 0
            && $from.depth >= 1;
          const replaceFrom = replaceEmptyParagraph ? $from.before($from.depth) : from;
          const replaceTo = replaceEmptyParagraph ? $from.after($from.depth) : to;
          const tr = state.tr.replaceRangeWith(replaceFrom, replaceTo, toggleNode);
          const searchStart = Math.max(0, replaceFrom - 2);
          const searchEnd = Math.min(tr.doc.content.size, replaceFrom + toggleNode.nodeSize + 2);
          let summaryEndPos: number | null = null;
          tr.doc.nodesBetween(searchStart, searchEnd, (node, pos) => {
            if (summaryEndPos !== null) return false;
            if (node.type === summaryType) {
              summaryEndPos = pos + node.nodeSize - 1;
              return false;
            }
            return true;
          });
          if (summaryEndPos !== null) {
            tr.setSelection(TextSelection.near(tr.doc.resolve(summaryEndPos)));
          }
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },

  parseHTML() {
    return [
      { tag: "details[data-note-toggle]" },
      { tag: "div[data-note-toggle]" },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const open = node.attrs.open !== false;
    return ["details", mergeAttributes(HTMLAttributes, {
      "data-note-toggle": "",
      "data-open": open ? "true" : "false",
      ...(open ? { open: "" } : {}),
      class: "notespace-note-toggle",
    }), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => {
    const children = node.content ?? [];
    const summaryNode = children.find((child) => child.type === "noteToggleSummary");
    const bodyNodes = children.filter((child) => child.type !== "noteToggleSummary");
    const summary = summaryNode ? helpers.renderChildren(summaryNode.content ?? [], "").trim() : "";
    const body = helpers.renderChildren(bodyNodes, "\n\n").trim();
    return `<details${node.attrs?.open === false ? "" : " open"}>\n<summary>${summary || "Toggle"}</summary>${body ? `\n\n${body}` : ""}\n</details>`;
  },
});

const NoteHighlight = Mark.create({
  name: "noteHighlight",

  addAttributes() {
    return {
      tone: {
        default: "yellow",
        parseHTML: (element: HTMLElement) => normalizeHighlightTone(element.getAttribute("data-note-highlight")),
        renderHTML: (attributes: { tone?: unknown }) => {
          const tone = normalizeHighlightTone(attributes.tone);
          return {
            "data-note-highlight": tone,
            class: `notespace-note-hl notespace-note-hl-${tone}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: "mark[data-note-highlight]" },
      { tag: "mark" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => `==${helpers.renderChildren(node)}==`,

  addCommands() {
    return {
      setNoteHighlight:
        (tone = "yellow") =>
        ({ commands }) =>
          commands.setMark(this.name, { tone: normalizeHighlightTone(tone) }),
      toggleNoteHighlight:
        (tone = "yellow") =>
        ({ commands }) =>
          commands.toggleMark(this.name, { tone: normalizeHighlightTone(tone) }),
      unsetNoteHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

const NoteTextColor = Mark.create({
  name: "noteTextColor",

  addAttributes() {
    return {
      tone: {
        default: "muted",
        parseHTML: (element: HTMLElement) => normalizeTextColorTone(element.getAttribute("data-note-text-color")) ?? "muted",
        renderHTML: (attributes: { tone?: unknown }) => {
          const tone = normalizeTextColorTone(attributes.tone);
          if (!tone) return {};
          return {
            "data-note-text-color": tone,
            class: `notespace-note-tc notespace-note-tc-${tone}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-note-text-color]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) => helpers.renderChildren(node),

  addCommands() {
    return {
      setNoteTextColor:
        (tone) =>
        ({ commands }) => {
          const normalized = normalizeTextColorTone(tone);
          return normalized ? commands.setMark(this.name, { tone: normalized }) : commands.unsetMark(this.name);
        },
      unsetNoteTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/**
 * One schema for the editor and the read-only renderer. StarterKit's own Link/Underline are
 * disabled so the configured safe-link policy below is the only Link implementation.
 */
export function createNoteExtensions(options?: CreateNoteExtensionsOptions): Extensions {
  const onEditMath = options?.onEditMath;
  return [
    StarterKit.configure({ link: false, underline: false }),
    NoteImage,
    NoteEmbed,
    NoteBlockReference,
    NoteCallout,
    NoteToggle,
    NoteToggleSummary,
    NoteHighlight,
    NoteTextColor,
    NoteBlockIdentity,
    NotePlaceholder,
    Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, protocols: ["http", "https", "mailto"], isAllowedUri: (url, context) => isSafeNoteLink(url) && (url.startsWith("/") || context.defaultValidate(url)) }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Mathematics.configure({
      katexOptions: { throwOnError: false, strict: false, trust: false },
      ...(onEditMath
        ? {
            inlineOptions: {
              onClick: (node, pos) => {
                onEditMath({
                  pos,
                  latex: typeof node.attrs.latex === "string" ? node.attrs.latex : "",
                  block: false,
                });
              },
            },
            blockOptions: {
              onClick: (node, pos) => {
                onEditMath({
                  pos,
                  latex: typeof node.attrs.latex === "string" ? node.attrs.latex : "",
                  block: true,
                });
              },
            },
          }
        : {}),
    }),
    Markdown,
  ];
}
