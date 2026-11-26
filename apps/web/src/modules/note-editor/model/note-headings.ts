import type { NoteDocument } from "../../../entities/note.ts";
import { inlineText, lexNote, noteBlocks, type NoteToken } from "./note-markdown.ts";

export type MarkdownHeadingItem = {
  depth: 1 | 2 | 3;
  text: string;
  blockId?: string;
};

/**
 * Extracts H1–H3 headings from a canonical Markdown NoteDocument, preserving
 * the `blockId` assigned by `noteBlocks` so Outline navigation aligns with `NoteReadView`.
 */
export function extractMarkdownHeadings(document: NoteDocument | null | undefined): MarkdownHeadingItem[] {
  if (!document || document.type !== "markdown" || !document.text.trim()) return [];
  try {
    const blocks = noteBlocks(lexNote(document));
    const headings: MarkdownHeadingItem[] = [];
    for (const token of blocks) {
      if (token.type !== "heading") continue;
      const depth = (token as NoteToken & { depth?: number }).depth;
      if (depth !== 1 && depth !== 2 && depth !== 3) continue;
      const text = inlineText((token as NoteToken & { tokens?: NoteToken[] }).tokens).trim();
      if (!text) continue;
      headings.push({
        depth,
        text,
        ...(token.blockId ? { blockId: token.blockId } : {}),
      });
    }
    return headings;
  } catch {
    return [];
  }
}
