import { Node, mergeAttributes, type JSONContent, type MarkdownRendererHelpers } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

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
