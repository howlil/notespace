import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  isValidNoteBlockId,
  NOTE_BLOCK_NODE_TYPES,
  noteBlockIdRepairs,
  type NoteNode,
  type RichNoteDocument,
} from "../../../entities/note";

const blockNodeTypes = NOTE_BLOCK_NODE_TYPES;

function createBlockId() {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ensureNoteBlockIds(document: RichNoteDocument): RichNoteDocument {
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
