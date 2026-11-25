import { marked, type Token, type Tokens } from "marked";
import { isSafeNoteLink, type NoteDocument, type NoteNode, type RichNoteDocument } from "../../../entities/note.ts";

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, dec?: string, hex?: string, named?: string) => {
    if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return named && named in NAMED_HTML_ENTITIES ? NAMED_HTML_ENTITIES[named] : match;
  });
}

function text(value: string): NoteNode[] {
  return value ? [{ type: "text", text: value }] : [];
}

function inline(tokens: readonly Token[] = []): NoteNode[] {
  return tokens.flatMap((token): NoteNode[] => {
    switch (token.type) {
      case "strong":
      case "em":
      case "del": {
        const kind = { strong: "bold", em: "italic", del: "strike" } as const;
        const type = kind[(token as Tokens.Strong | Tokens.Em | Tokens.Del).type];
        return inline(token.tokens).map((node) => node.type === "text" ? { ...node, marks: [...(node.marks ?? []), { type }] } : node);
      }
      case "codespan":
        return token.text ? [{ type: "text", text: token.text, marks: [{ type: "code" }] }] : [];
      case "link": {
        const content = inline(token.tokens);
        if (!isSafeNoteLink(token.href)) return content;
        return content.map((node) => node.type === "text"
          ? { ...node, marks: [...(node.marks ?? []), { type: "link", attrs: { href: token.href } }] }
          : node);
      }
      case "br":
        return [{ type: "hardBreak" }];
      case "text":
      case "image":
        return token.tokens?.length ? inline(token.tokens) : text(decodeHtmlEntities(token.text));
      case "escape":
        return text(token.text);
      default:
        return text(token.raw);
    }
  });
}

function blocks(tokens: readonly Token[] = []): NoteNode[] {
  return tokens.flatMap((token): NoteNode[] => {
    switch (token.type) {
      case "space":
      case "def":
        return [];
      case "heading":
        return [{ type: "heading", attrs: { level: token.depth }, content: inline(token.tokens) }];
      case "paragraph":
      case "text":
        return [{ type: "paragraph", content: token.tokens?.length ? inline(token.tokens) : text(decodeHtmlEntities(token.text)) }];
      case "blockquote":
        return [{ type: "blockquote", content: blocks(token.tokens) }];
      case "code":
        return [{ type: "codeBlock", attrs: { language: token.lang?.split(/\s+/)[0] ?? null }, content: text(token.text) }];
      case "hr":
        return [{ type: "horizontalRule" }];
      case "list": {
        const list = token as Tokens.List;
        const groups: NoteNode[] = [];
        for (const item of list.items) {
          const type = item.task ? "taskList" : list.ordered ? "orderedList" : "bulletList";
          let group = groups.at(-1);
          if (group?.type !== type) {
            group = { type, ...(type === "orderedList" ? { attrs: { start: list.start } } : {}), content: [] };
            groups.push(group);
          }
          const content = blocks(item.tokens);
          (group.content ??= []).push(item.task
            ? { type: "taskItem", attrs: { checked: Boolean(item.checked) }, content }
            : { type: "listItem", content });
        }
        return groups;
      }
      default:
        // Keep unsupported markup legible as authored text. The renderers escape text nodes.
        return [{ type: "paragraph", content: text(token.raw.trimEnd()) }];
    }
  });
}

/** Only the card's renderers consume this projection. Saves always use the Markdown source. */
export function notePreviewDocument(document: NoteDocument): RichNoteDocument {
  if (document.type === "doc") return document;
  try {
    return { type: "doc", content: blocks(marked.lexer(document.text, { gfm: true })) };
  } catch {
    return { type: "doc", content: [{ type: "paragraph", content: text(document.text) }] };
  }
}
