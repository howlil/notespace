import type { Snapshot } from "../project/project";

type Mark = { type: string; attrs?: Record<string, unknown> };
type JsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: Mark[];
};

function newBlockId() {
  return crypto.randomUUID();
}

function inlineNodes(value: string): JsonNode[] {
  if (!value) return [];
  const nodes: JsonNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: "text", text: value.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith("**")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "bold" }] });
    else if (token.startsWith("~~")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "strike" }] });
    else if (token.startsWith("`")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "code" }] });
    else if (token.startsWith("*")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "italic" }] });
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) nodes.push({ type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] });
    }
    cursor = index + token.length;
  }
  if (cursor < value.length) nodes.push({ type: "text", text: value.slice(cursor) });
  return nodes;
}

function paragraph(value: string): JsonNode {
  return { type: "paragraph", attrs: { blockId: newBlockId() }, ...(value ? { content: inlineNodes(value) } : {}) };
}

function listItem(value: string): JsonNode {
  return { type: "listItem", attrs: { blockId: newBlockId() }, content: [paragraph(value)] };
}

function isSpecialLine(line: string) {
  return /^(#{1,3}\s+|```|>\s?|[-*+]\s+|\d+[.)]\s+|(?:---|___|\*\*\*)\s*$)/.test(line);
}

export function markdownToSnapshot(markdown: string): Snapshot {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: JsonNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^```/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) body.push(lines[index++]);
      if (index < lines.length) index += 1;
      content.push({ type: "codeBlock", attrs: { blockId: newBlockId() }, content: body.length ? [{ type: "text", text: body.join("\n") }] : undefined });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      content.push({ type: "heading", attrs: { level: heading[1].length, blockId: newBlockId() }, content: inlineNodes(heading[2].trim()) });
      index += 1;
      continue;
    }

    if (/^(?:---|___|\*\*\*)\s*$/.test(line)) {
      content.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      content.push({ type: "blockquote", content: [paragraph(quote.join(" ").trim())] });
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: JsonNode[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) items.push(listItem(lines[index++].replace(/^[-*+]\s+/, "")));
      content.push({ type: "bulletList", content: items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: JsonNode[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index])) items.push(listItem(lines[index++].replace(/^\d+[.)]\s+/, "")));
      content.push({ type: "orderedList", attrs: { start: 1 }, content: items });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isSpecialLine(lines[index])) paragraphLines.push(lines[index++].trim());
    content.push(paragraph(paragraphLines.join(" ")));
  }

  return {
    format: "tiptap",
    version: 1,
    data: { type: "doc", content: content.length ? content : [paragraph("")] },
  };
}

function inlineMarkdown(node: JsonNode): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type !== "text") return (node.content ?? []).map(inlineMarkdown).join("");
  let value = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") value = `**${value}**`;
    else if (mark.type === "italic") value = `*${value}*`;
    else if (mark.type === "strike") value = `~~${value}~~`;
    else if (mark.type === "code") value = `\`${value}\``;
    else if (mark.type === "link" && typeof mark.attrs?.href === "string") value = `[${value}](${mark.attrs.href})`;
  }
  return value;
}

function blockMarkdown(node: JsonNode, depth = 0): string {
  const inline = () => (node.content ?? []).map(inlineMarkdown).join("");
  if (node.type === "paragraph") return inline();
  if (node.type === "heading") return `${"#".repeat(Math.max(1, Math.min(3, Number(node.attrs?.level) || 1)))} ${inline()}`;
  if (node.type === "horizontalRule") return "---";
  if (node.type === "codeBlock") return `\`\`\`\n${inline()}\n\`\`\``;
  if (node.type === "blockquote") return (node.content ?? []).map((child) => blockMarkdown(child, depth)).join("\n").split("\n").map((line) => `> ${line}`).join("\n");
  if (node.type === "bulletList" || node.type === "orderedList") {
    return (node.content ?? []).map((item, index) => {
      const body = (item.content ?? []).map((child) => blockMarkdown(child, depth + 1)).filter(Boolean).join(" ");
      const marker = node.type === "orderedList" ? `${index + 1}.` : "-";
      return `${"  ".repeat(depth)}${marker} ${body}`;
    }).join("\n");
  }
  if (node.type === "taskList") {
    return (node.content ?? []).map((item) => {
      const checked = item.attrs?.checked === true ? "x" : " ";
      const body = (item.content ?? []).map((child) => blockMarkdown(child, depth + 1)).filter(Boolean).join(" ");
      return `${"  ".repeat(depth)}- [${checked}] ${body}`;
    }).join("\n");
  }
  if (node.type === "image") {
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "image";
    const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    return src ? `![${alt}](${src})` : "";
  }
  return (node.content ?? []).map((child) => blockMarkdown(child, depth)).filter(Boolean).join("\n");
}

export function snapshotToMarkdown(snapshot: Snapshot): string {
  const root = snapshot.data as JsonNode;
  return (root.content ?? []).map((node) => blockMarkdown(node)).filter(Boolean).join("\n\n").trimEnd() + "\n";
}

export function captureTitle(markdown: string) {
  const first = markdown.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).find(Boolean) ?? "Quick capture";
  const plain = first
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .trim();
  return (plain || "Quick capture").slice(0, 80);
}
