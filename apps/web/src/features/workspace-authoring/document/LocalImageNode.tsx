import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, IconButton, Input, cn } from "../../../shared/ui";
import { useImageAssetUrl } from "../assets/use-image-asset-url";

function LocalImageView({ node, workspaceId, updateAttributes, deleteNode, selected }: NodeViewProps & { workspaceId: string }) {
  const assetId = typeof node.attrs.assetId === "string" ? node.attrs.assetId : "";
  const fallbackSrc = typeof node.attrs.src === "string" && !node.attrs.src.startsWith("notespace-asset:") ? node.attrs.src : null;
  const src = useImageAssetUrl(workspaceId, assetId || null, fallbackSrc);
  const [editingAlt, setEditingAlt] = useState(false);
  const [alt, setAlt] = useState(typeof node.attrs.alt === "string" ? node.attrs.alt : "");

  function commitAlt() {
    updateAttributes({ alt: alt.trim() || "Pasted image" });
    setEditingAlt(false);
  }

  return (
    <NodeViewWrapper className="group relative my-3.5 block max-w-full">
      <motion.div layout className={cn("relative inline-block max-w-full rounded-lg", selected && "ring-2 ring-accent/40")}>
        {src ? (
          <img className="block h-auto max-w-full rounded-lg border border-line" src={src} alt={node.attrs.alt || "Pasted image"} draggable={false} />
        ) : (
          <span className="block rounded-lg border border-dashed border-line p-3 text-[11px] text-muted">Image could not be loaded.</span>
        )}
        <div className="absolute right-2 top-2 flex gap-1 rounded-md border border-line bg-surface/92 p-1 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button type="button" variant="ghost" size="sm" className="!min-h-6 px-2 py-1 text-[10px]" onClick={() => setEditingAlt(true)}>Alt</Button>
          <IconButton type="button" className="!size-6 text-muted hover:bg-tint hover:text-danger" aria-label="Remove image" onClick={deleteNode}><Trash2 size={12} /></IconButton>
        </div>
      </motion.div>
      <AnimatePresence initial={false}>
        {editingAlt && (
          <motion.form
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 flex max-w-sm gap-1.5"
            onSubmit={(event) => { event.preventDefault(); commitAlt(); }}
          >
            <Input value={alt} onChange={(event) => setAlt(event.target.value)} className="min-h-0 min-w-0 flex-1 px-2 py-1 text-[11px]" aria-label="Image alt text" autoFocus />
            <Button type="submit" size="sm">Save</Button>
          </motion.form>
        )}
      </AnimatePresence>
    </NodeViewWrapper>
  );
}

export function createLocalImageExtension(workspaceId: string) {
  return TiptapNode.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        assetId: { default: null },
        src: { default: null },
        alt: { default: "Pasted image" },
      };
    },
    parseHTML() { return [{ tag: "img[src]" }]; },
    renderHTML({ HTMLAttributes }) {
      const attributes = { ...HTMLAttributes };
      delete attributes.assetId;
      return ["img", mergeAttributes(attributes)];
    },
    addNodeView() {
      return ReactNodeViewRenderer((props) => <LocalImageView {...props} workspaceId={workspaceId} />);
    },
  });
}
