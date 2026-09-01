import { Extension, type Editor } from "@tiptap/core";

const supportedBlocks = ["paragraph", "heading", "codeBlock", "listItem"];

export const BlockIdentity = Extension.create({
  name: "blockIdentity",
  addGlobalAttributes() {
    return [{
      types: supportedBlocks,
      attributes: {
        blockId: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"), renderHTML: (attrs: { blockId?: string }) => attrs.blockId ? { "data-block-id": attrs.blockId } : {} },
      },
    }];
  },
});

/** Adds IDs only where absent, preserving all existing snapshots and IDs. */
export function assignMissingBlockIds(editor: Editor) {
  let transaction = editor.state.tr;
  let changed = false;
  editor.state.doc.descendants((node, pos) => {
    if (supportedBlocks.includes(node.type.name) && !node.attrs.blockId) {
      transaction = transaction.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: crypto.randomUUID() });
      changed = true;
    }
  });
  if (changed) editor.view.dispatch(transaction);
  return changed;
}
