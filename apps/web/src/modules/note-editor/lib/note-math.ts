import katex from "katex";
import type { NoteNode, RichNoteDocument } from "../../../entities/note";

type NoteLatexValidation =
  | { ok: true; html: string }
  | { ok: false; error: string };

const UNTRUSTED_LATEX_COMMAND = /\\(?:href|url|includegraphics|htmlClass|htmlId|htmlStyle|htmlData)\b/i;

/**
 * Validates and renders a LaTeX formula with KaTeX (`trust: false` blocks unsafe commands).
 * On invalid syntax, returns a recoverable error without inventing a result (B14).
 */
export function renderNoteLatex(latex: string, displayMode: boolean): NoteLatexValidation {
  const source = latex.trim();
  if (!source) {
    return { ok: false, error: "Enter a LaTeX formula." };
  }
  if (UNTRUSTED_LATEX_COMMAND.test(source)) {
    return { ok: false, error: "Links and HTML commands are not allowed in Math formulas." };
  }
  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      strict: false,
      trust: false,
      displayMode,
    });
    if (html.includes("katex-error")) {
      return { ok: false, error: "Invalid LaTeX formula." };
    }
    return { ok: true, html };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Invalid LaTeX formula.";
    return { ok: false, error: raw.replace(/^KaTeX parse error:\s*/i, "") };
  }
}

const DISPLAY_MATH_REGEX = /\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH_REGEX = /\\\(([\s\S]+?)\\\)/g;

function hasCodeMark(node: NoteNode): boolean {
  return Boolean(node.marks?.some((mark) => mark.type === "code"));
}

function paragraphPlainText(node: NoteNode): string | null {
  if (node.type !== "paragraph") return null;
  const children = node.content ?? [];
  let text = "";
  for (const child of children) {
    if (child.type === "text" && typeof child.text === "string" && !hasCodeMark(child)) {
      text += child.text;
    } else if (child.type === "hardBreak") {
      text += "\n";
    } else {
      return null;
    }
  }
  return text;
}

function upgradeInlineMathInTextNode(node: NoteNode): { nodes: NoteNode[]; changed: boolean } {
  if (node.type !== "text" || typeof node.text !== "string" || hasCodeMark(node)) {
    return { nodes: [node], changed: false };
  }
  if (!node.text.includes("\\(")) return { nodes: [node], changed: false };

  const out: NoteNode[] = [];
  let lastIndex = 0;
  let changed = false;
  INLINE_MATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_MATH_REGEX.exec(node.text)) !== null) {
    const rawLatex = match[1]?.trim() ?? "";
    if (!rawLatex || !renderNoteLatex(rawLatex, false).ok) continue;
    if (match.index > lastIndex) {
      out.push({ ...node, text: node.text.slice(lastIndex, match.index) });
    }
    out.push({ type: "inlineMath", attrs: { latex: rawLatex } });
    lastIndex = match.index + match[0].length;
    changed = true;
  }
  if (!changed) return { nodes: [node], changed: false };
  if (lastIndex < node.text.length) {
    out.push({ ...node, text: node.text.slice(lastIndex) });
  }
  return { nodes: out, changed: true };
}

function splitParagraphWithDisplayMath(node: NoteNode): { nodes: NoteNode[]; changed: boolean } {
  const plain = paragraphPlainText(node);
  if (plain === null || (!plain.includes("\\[") && !plain.includes("$$"))) {
    return { nodes: [node], changed: false };
  }

  const out: NoteNode[] = [];
  let lastIndex = 0;
  let changed = false;
  DISPLAY_MATH_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DISPLAY_MATH_REGEX.exec(plain)) !== null) {
    const rawLatex = (match[1] ?? match[2] ?? "").trim();
    if (!rawLatex || !renderNoteLatex(rawLatex, true).ok) continue;
    const before = plain.slice(lastIndex, match.index).trim();
    if (before) {
      const { nodes: inlineNodes } = upgradeInlineMathInTextNode({ type: "text", text: before });
      out.push({ type: "paragraph", content: inlineNodes });
    }
    out.push({ type: "blockMath", attrs: { latex: rawLatex } });
    lastIndex = match.index + match[0].length;
    changed = true;
  }
  if (!changed) return { nodes: [node], changed: false };
  const after = plain.slice(lastIndex).trim();
  if (after) {
    const { nodes: inlineNodes } = upgradeInlineMathInTextNode({ type: "text", text: after });
    out.push({ type: "paragraph", content: inlineNodes });
  }
  return { nodes: out, changed: true };
}

function upgradeBlockList(blocks: NoteNode[]): { blocks: NoteNode[]; changed: boolean } {
  const result: NoteNode[] = [];
  let changed = false;

  for (let i = 0; i < blocks.length; i += 1) {
    const current = blocks[i]!;
    if (current.type === "codeBlock") {
      result.push(current);
      continue;
    }

    // Handle multi-paragraph display math blocks starting with `\[` or `$$` and ending with `\]` or `$$`.
    const startText = paragraphPlainText(current)?.trim();
    if (startText && (startText.startsWith("\\[") || startText.startsWith("$$"))) {
      const closeDelim = startText.startsWith("\\[") ? "\\]" : "$$";
      const openLen = 2;
      if (!startText.slice(openLen).includes(closeDelim)) {
        let endIndex = -1;
        const lines = [startText.slice(openLen)];
        for (let j = i + 1; j < blocks.length; j += 1) {
          const line = paragraphPlainText(blocks[j]!);
          if (line === null) break;
          const trimmed = line.trim();
          if (trimmed.endsWith(closeDelim)) {
            lines.push(trimmed.slice(0, -closeDelim.length));
            endIndex = j;
            break;
          }
          lines.push(line);
        }
        if (endIndex !== -1) {
          const latex = lines.join("\n").trim();
          if (latex && renderNoteLatex(latex, true).ok) {
            result.push({ type: "blockMath", attrs: { latex } });
            i = endIndex;
            changed = true;
            continue;
          }
        }
      }
    }

    if (current.type === "paragraph") {
      const split = splitParagraphWithDisplayMath(current);
      if (split.changed) {
        result.push(...split.nodes);
        changed = true;
        continue;
      }
      if (current.content?.length) {
        let paraChanged = false;
        const nextChildren: NoteNode[] = [];
        for (const child of current.content) {
          const upgraded = upgradeInlineMathInTextNode(child);
          if (upgraded.changed) paraChanged = true;
          nextChildren.push(...upgraded.nodes);
        }
        if (paraChanged) {
          result.push({ ...current, content: nextChildren });
          changed = true;
          continue;
        }
      }
      result.push(current);
      continue;
    }

    if (current.content?.length) {
      const nested = upgradeBlockList(current.content);
      if (nested.changed) {
        result.push({ ...current, content: nested.blocks });
        changed = true;
        continue;
      }
    }

    result.push(current);
  }

  return { blocks: changed ? result : blocks, changed };
}

/**
 * Converts raw LaTeX delimiters (`\[...\]`, `$$...$$`, and `\(...\)`) in plain Note paragraphs
 * into native `blockMath` / `inlineMath` nodes whenever KaTeX validates them.
 */
export function upgradeLatexDelimitersInDocument(document: RichNoteDocument): RichNoteDocument {
  if (!Array.isArray(document.content) || document.content.length === 0) return document;
  const { blocks, changed } = upgradeBlockList(document.content);
  return changed ? { ...document, content: blocks } : document;
}
