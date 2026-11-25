import { ChevronRight } from "lucide-react";
import { Node, mergeAttributes, type JSONContent, type MarkdownRendererHelpers } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteToggle: {
      insertNoteToggle: (options?: { summary?: string; open?: boolean }) => ReturnType;
    };
  }
}

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

export const NoteToggleSummary = Node.create({
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

export const NoteToggle = Node.create({
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
