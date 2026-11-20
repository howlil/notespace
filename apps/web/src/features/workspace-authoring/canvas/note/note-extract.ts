import type { NoteDocument, NoteNode } from "../../../../domain/note/note";

export type ExtractBlocksRange = {
  startIndex: number;
  endIndex: number;
};

export type ExtractBlocksOptions = {
  leaveLink?: {
    href: string;
    label: string;
  };
};

export type ExtractBlocksResult = {
  extracted: NoteDocument;
  remaining: NoteDocument;
};

export type NoteBlockSummary = {
  blockId: string;
  preview: string;
  type: string;
};

export type NoteTaskToggleTarget = {
  blockId?: string;
  index: number;
  checked: boolean;
};

const NON_TEXT_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "noteImage",
  "noteEmbed",
  "noteBlockReference",
  "inlineMath",
  "blockMath",
  "horizontalRule",
  "table",
  "noteToggle",
]);

const BLOCK_PREVIEW_MAX_LENGTH = 120;

function cloneNode(node: NoteNode): NoteNode {
  return {
    type: node.type,
    ...(node.attrs ? { attrs: { ...node.attrs } } : {}),
    ...(node.marks ? { marks: node.marks.map((mark) => ({ type: mark.type, ...(mark.attrs ? { attrs: { ...mark.attrs } } : {}) })) } : {}),
    ...(typeof node.text === "string" ? { text: node.text } : {}),
    ...(node.content ? { content: node.content.map(cloneNode) } : {}),
  };
}

function hasExtractableContent(nodes: readonly NoteNode[]): boolean {
  for (const node of nodes) {
    if (typeof node.text === "string" && node.text.trim().length > 0) return true;
    if (NON_TEXT_CONTENT_TYPES.has(node.type)) return true;
    if (node.content && hasExtractableContent(node.content)) return true;
  }
  return false;
}

/**
 * Extracts top-level blocks `[startIndex..endIndex]` (inclusive) into a new valid `NoteDocument`.
 * Rejects invalid ranges or selections that contain only empty whitespace blocks.
 */
export function extractBlocksFromDocument(
  document: NoteDocument,
  range: ExtractBlocksRange,
  options?: ExtractBlocksOptions,
): ExtractBlocksResult | null {
  const { startIndex, endIndex } = range;
  const total = document.content.length;
  if (
    total === 0
    || !Number.isInteger(startIndex)
    || !Number.isInteger(endIndex)
    || startIndex < 0
    || endIndex < startIndex
    || endIndex >= total
  ) {
    return null;
  }

  const sliced = document.content.slice(startIndex, endIndex + 1);
  if (!hasExtractableContent(sliced)) return null;

  const extracted: NoteDocument = {
    type: "doc",
    content: sliced.map(cloneNode),
  };

  const before = document.content.slice(0, startIndex).map(cloneNode);
  const after = document.content.slice(endIndex + 1).map(cloneNode);
  const href = options?.leaveLink?.href.trim() ?? "";

  let remainingContent: NoteNode[];
  if (href) {
    const label = options?.leaveLink?.label.trim() || href;
    const linkParagraph: NoteNode = {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href } }],
        },
      ],
    };
    remainingContent = [...before, linkParagraph, ...after];
  } else {
    remainingContent = [...before, ...after];
    if (remainingContent.length === 0) {
      remainingContent = [{ type: "paragraph" }];
    }
  }

  return {
    extracted,
    remaining: { type: "doc", content: remainingContent },
  };
}

function nodeInlineText(node: NoteNode): string {
  if (typeof node.text === "string") return node.text;
  if ((node.type === "inlineMath" || node.type === "blockMath") && typeof node.attrs?.latex === "string") {
    return node.attrs.latex;
  }
  if (!node.content?.length) return "";
  return node.content.map(nodeInlineText).join(node.type === "paragraph" || node.type === "heading" || node.type === "noteToggleSummary" ? "" : " ");
}

function capPreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= BLOCK_PREVIEW_MAX_LENGTH) return collapsed;
  return `${collapsed.slice(0, BLOCK_PREVIEW_MAX_LENGTH - 1).trimEnd()}…`;
}

function blockPreview(node: NoteNode): string {
  switch (node.type) {
    case "noteImage": {
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt.trim() : "";
      return capPreview(alt || "Image");
    }
    case "noteEmbed": {
      const label = typeof node.attrs?.label === "string" ? node.attrs.label.trim() : "";
      return capPreview(label || "Embedded Note");
    }
    case "noteBlockReference":
      return "Block reference";
    case "horizontalRule":
      return "Divider";
    case "noteToggle": {
      const summary = node.content?.find((child) => child.type === "noteToggleSummary");
      const text = summary ? capPreview(nodeInlineText(summary)) : capPreview(nodeInlineText(node));
      return text || "Toggle";
    }
    default:
      return capPreview(nodeInlineText(node));
  }
}

/** Finds a block anywhere in a `NoteDocument` by its stable `attrs.blockId`. */
export function findBlockById(document: NoteDocument | null | undefined, blockId: string): NoteNode | null {
  if (!document || !blockId) return null;
  const visit = (nodes: readonly NoteNode[]): NoteNode | null => {
    for (const node of nodes) {
      if (node.attrs?.blockId === blockId) return node;
      if (node.content) {
        const nested = visit(node.content);
        if (nested) return nested;
      }
    }
    return null;
  };
  return visit(document.content);
}

/** Lists non-empty addressable blocks (with `blockId`) in document order for block-reference pickers. */
export function listNoteBlocks(document: NoteDocument | null | undefined): NoteBlockSummary[] {
  if (!document) return [];
  const results: NoteBlockSummary[] = [];
  const visit = (nodes: readonly NoteNode[]) => {
    for (const node of nodes) {
      const blockId = typeof node.attrs?.blockId === "string" ? node.attrs.blockId : "";
      if (blockId) {
        const preview = blockPreview(node);
        if (preview) {
          results.push({ blockId, preview, type: node.type });
        }
      }
      if (node.content) visit(node.content);
    }
  };
  visit(document.content);
  return results;
}

function matchesTaskBlockId(node: NoteNode, blockId: string): boolean {
  if (node.attrs?.blockId === blockId) return true;
  return Boolean(node.content?.some((child) => child.attrs?.blockId === blockId));
}

function hasTaskMatchingBlockId(nodes: readonly NoteNode[], blockId: string): boolean {
  for (const node of nodes) {
    if (node.type === "taskItem" && matchesTaskBlockId(node, blockId)) return true;
    if (node.content && hasTaskMatchingBlockId(node.content, blockId)) return true;
  }
  return false;
}

/**
 * Pure immutable update that toggles a `taskItem`'s `checked` attribute in a `NoteDocument`.
 * Matches by `blockId` (on the `taskItem` or its child block) when present, falling back to
 * 0-based document-order `index`.
 */
export function toggleTaskInDocument(document: NoteDocument, target: NoteTaskToggleTarget): NoteDocument {
  const checked = Boolean(target.checked);
  const useBlockId = Boolean(target.blockId && hasTaskMatchingBlockId(document.content, target.blockId));
  let taskIndex = 0;
  let changed = false;

  const visit = (nodes: readonly NoteNode[]): NoteNode[] => {
    let next: NoteNode[] | null = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      let updatedNode = node;
      let isTarget = false;
      if (node.type === "taskItem") {
        const currentIndex = taskIndex;
        taskIndex += 1;
        isTarget = useBlockId
          ? matchesTaskBlockId(node, target.blockId!)
          : currentIndex === target.index;
      }

      const nextContent = node.content ? visit(node.content) : undefined;
      if (isTarget && Boolean(node.attrs?.checked) !== checked) {
        changed = true;
        updatedNode = {
          ...node,
          attrs: { ...(node.attrs ?? {}), checked },
          ...(nextContent ? { content: nextContent } : {}),
        };
      } else if (nextContent && nextContent !== node.content) {
        updatedNode = { ...node, content: nextContent };
      }

      if (updatedNode !== node) {
        next ??= nodes.slice();
        next[i] = updatedNode;
      }
    }
    return next ?? (nodes as NoteNode[]);
  };

  const content = visit(document.content);
  if (!changed) return document;
  return { ...document, content };
}

/**
 * Pure immutable update that sets a `noteToggle` block's `open` state by `blockId`.
 */
export function toggleNoteToggleInDocument(document: NoteDocument, blockId: string, open: boolean): NoteDocument {
  if (!blockId) return document;
  let changed = false;

  const visit = (nodes: readonly NoteNode[]): NoteNode[] => {
    let next: NoteNode[] | null = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      let updatedNode = node;
      const nextContent = node.content ? visit(node.content) : undefined;
      if (node.type === "noteToggle" && node.attrs?.blockId === blockId) {
        const currentOpen = node.attrs?.open !== false;
        if (currentOpen !== open || node.attrs?.open !== open) {
          changed = true;
          updatedNode = {
            ...node,
            attrs: { ...(node.attrs ?? {}), open },
            ...(nextContent ? { content: nextContent } : {}),
          };
        }
      } else if (nextContent && nextContent !== node.content) {
        updatedNode = { ...node, content: nextContent };
      }

      if (updatedNode !== node) {
        next ??= nodes.slice();
        next[i] = updatedNode;
      }
    }
    return next ?? (nodes as NoteNode[]);
  };

  const content = visit(document.content);
  if (!changed) return document;
  return { ...document, content };
}
