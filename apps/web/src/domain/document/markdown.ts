import type { Snapshot } from "../project/project";

type Mark = { type: string; attrs?: Record<string, unknown> };
type JsonNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: Mark[];
};

type AssetSources = Record<string, string>;
type ListLine = { indent: number; ordered: boolean; start: number; value: string };
type TaskLine = { indent: number; checked: boolean; value: string };

function newBlockId() {
  return crypto.randomUUID();
}

function inlineNodes(value: string): JsonNode[] {
  if (!value) return [];
  const nodes: JsonNode[] = [];
  const pattern = /(\*\*\*[^*]+\*\*\*|(?<!\w)___[^_]+___(?!\w)|\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|~~[^~]+~~|`[^`]+`|\*[^*]+\*|(?<!\w)_[^_]+_(?!\w)|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ type: "text", text: value.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith("***") || token.startsWith("___")) nodes.push({ type: "text", text: token.slice(3, -3), marks: [{ type: "bold" }, { type: "italic" }] });
    else if (token.startsWith("**") || token.startsWith("__")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "bold" }] });
    else if (token.startsWith("~~")) nodes.push({ type: "text", text: token.slice(2, -2), marks: [{ type: "strike" }] });
    else if (token.startsWith("`")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "code" }] });
    else if (token.startsWith("*") || token.startsWith("_")) nodes.push({ type: "text", text: token.slice(1, -1), marks: [{ type: "italic" }] });
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

function taskItem(value: string, checked: boolean): JsonNode {
  return { type: "taskItem", attrs: { blockId: newBlockId(), checked }, content: [paragraph(value)] };
}

function indentation(value: string) {
  return value.replace(/\t/g, "  ").length;
}

function listLine(line: string): ListLine | null {
  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  const ordered = /^\d/.test(match[2]);
  return { indent: indentation(match[1]), ordered, start: ordered ? Number(match[2].match(/^\d+/)?.[0] ?? 1) : 1, value: match[3] };
}

function taskLine(line: string): TaskLine | null {
  const match = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.+)$/);
  return match ? { indent: indentation(match[1]), checked: match[2].toLowerCase() === "x", value: match[3] } : null;
}

function parseTaskList(lines: string[], startIndex: number, baseIndent: number): [JsonNode, number] {
  const items: JsonNode[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const current = taskLine(lines[index]);
    if (!current || current.indent !== baseIndent) break;
    const item = taskItem(current.value, current.checked);
    items.push(item);
    index += 1;

    const nestedTask = index < lines.length ? taskLine(lines[index]) : null;
    const nestedList = index < lines.length ? listLine(lines[index]) : null;
    const nestedIndent = nestedTask?.indent ?? nestedList?.indent ?? -1;
    if (nestedIndent > baseIndent) {
      const [nested, next] = nestedTask
        ? parseTaskList(lines, index, nestedIndent)
        : parseList(lines, index, nestedIndent);
      item.content?.push(nested);
      index = next;
    }
  }
  return [{ type: "taskList", content: items }, index];
}

function parseList(lines: string[], startIndex: number, baseIndent: number): [JsonNode, number] {
  const first = listLine(lines[startIndex]);
  if (!first) return [{ type: "bulletList", content: [] }, startIndex];
  const items: JsonNode[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = listLine(lines[index]);
    if (!current || current.indent < baseIndent) break;
    if (current.indent > baseIndent) {
      if (!items.length) break;
      const nestedTask = taskLine(lines[index]);
      const [nested, next] = nestedTask
        ? parseTaskList(lines, index, current.indent)
        : parseList(lines, index, current.indent);
      items[items.length - 1].content?.push(nested);
      index = next;
      continue;
    }
    if (current.ordered !== first.ordered || taskLine(lines[index])) break;
    items.push(listItem(current.value));
    index += 1;
  }

  return [{ type: first.ordered ? "orderedList" : "bulletList", ...(first.ordered ? { attrs: { start: first.start } } : {}), content: items }, index];
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  let inCode = false;
  for (const character of value) {
    if (escaped) { cell += character; escaped = false; continue; }
    if (character === "\\") { escaped = true; cell += character; continue; }
    if (character === "`") { inCode = !inCode; cell += character; continue; }
    if (character === "|" && !inCode) { cells.push(cell.trim().replace(/\\\|/g, "|")); cell = ""; continue; }
    cell += character;
  }
  cells.push(cell.trim().replace(/\\\|/g, "|"));
  return cells;
}

function isTableDivider(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function isTableStart(lines: string[], index: number) {
  return index + 1 < lines.length && lines[index].includes("|") && isTableDivider(lines[index + 1]);
}

function tableCell(value: string, header: boolean): JsonNode {
  return { type: header ? "tableHeader" : "tableCell", content: [paragraph(value)] };
}

function parseTable(lines: string[], startIndex: number): [JsonNode, number] {
  const headers = splitTableRow(lines[startIndex]);
  const rows: JsonNode[] = [{ type: "tableRow", content: headers.map((cell) => tableCell(cell, true)) }];
  let index = startIndex + 2;
  while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
    const cells = splitTableRow(lines[index]);
    while (cells.length < headers.length) cells.push("");
    rows.push({ type: "tableRow", content: cells.slice(0, headers.length).map((cell) => tableCell(cell, false)) });
    index += 1;
  }
  return [{ type: "table", content: rows }, index];
}

function isSpecialLine(line: string) {
  return /^(#{1,6}\s+|```|~~~|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+|(?:---|___|\*\*\*)\s*$)/.test(line);
}

export function looksLikeMarkdown(markdown: string): boolean {
  const value = markdown.replace(/\r\n?/g, "\n");
  if (!value.trim()) return false;
  const lines = value.split("\n");
  const hasTable = lines.some((_, index) => isTableStart(lines, index));
  return (
    /(^|\n)#{1,6}\s+\S/.test(value) ||
    /(^|\n)(?:```|~~~)[^\n]*\n/.test(value) ||
    /(^|\n)>\s?\S/.test(value) ||
    /(^|\n)\s*[-*+]\s+\S/.test(value) ||
    /(^|\n)\s*\d+[.)]\s+\S/.test(value) ||
    /(^|\n)(?:---|___|\*\*\*)\s*(?:\n|$)/.test(value) ||
    hasTable ||
    /\*\*\*[^*\n]+\*\*\*/.test(value) ||
    /(?<!\w)___[^_\n]+___(?!\w)/.test(value) ||
    /\*\*[^*\n]+\*\*/.test(value) ||
    /(?<!\w)__[^_\n]+__(?!\w)/.test(value) ||
    /~~[^~\n]+~~/.test(value) ||
    /`[^`\n]+`/.test(value) ||
    /\[[^\]\n]+\]\([^)\n]+\)/.test(value)
  );
}

export function markdownToSnapshot(markdown: string): Snapshot {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: JsonNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^(```|~~~)/);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(marker)) body.push(lines[index++]);
      if (index < lines.length) index += 1;
      content.push({ type: "codeBlock", attrs: { blockId: newBlockId() }, content: body.length ? [{ type: "text", text: body.join("\n") }] : undefined });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
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

    if (isTableStart(lines, index)) {
      const [table, next] = parseTable(lines, index);
      content.push(table);
      index = next;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      content.push({ type: "blockquote", content: [paragraph(quote.join(" ").trim())] });
      continue;
    }

    const task = taskLine(line);
    if (task) {
      const [list, next] = parseTaskList(lines, index, task.indent);
      content.push(list);
      index = next;
      continue;
    }

    const listed = listLine(line);
    if (listed) {
      const [list, next] = parseList(lines, index, listed.indent);
      content.push(list);
      index = next;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isSpecialLine(lines[index]) && !isTableStart(lines, index)) paragraphLines.push(lines[index++].trim());
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

function tableMarkdown(node: JsonNode, assetSources: AssetSources): string {
  const rows = node.content ?? [];
  if (!rows.length) return "";
  const cells = (row: JsonNode) => (row.content ?? []).map((cell) => (cell.content ?? []).map((child) => blockMarkdown(child, assetSources)).join(" ").replace(/\|/g, "\\|").replace(/\n/g, "<br>"));
  const header = cells(rows[0]);
  const width = Math.max(1, header.length);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
  ];
  for (const row of rows.slice(1)) {
    const values = cells(row);
    while (values.length < width) values.push("");
    lines.push(`| ${values.slice(0, width).join(" | ")} |`);
  }
  return lines.join("\n");
}

function blockMarkdown(node: JsonNode, assetSources: AssetSources, depth = 0): string {
  const inline = () => (node.content ?? []).map(inlineMarkdown).join("");
  if (node.type === "paragraph") return inline();
  if (node.type === "heading") return `${"#".repeat(Math.max(1, Math.min(6, Number(node.attrs?.level) || 1)))} ${inline()}`;
  if (node.type === "horizontalRule") return "---";
  if (node.type === "codeBlock") return `\`\`\`\n${inline()}\n\`\`\``;
  if (node.type === "blockquote") return (node.content ?? []).map((child) => blockMarkdown(child, assetSources, depth)).join("\n").split("\n").map((line) => `> ${line}`).join("\n");
  if (node.type === "table") return tableMarkdown(node, assetSources);
  if (node.type === "bulletList" || node.type === "orderedList") {
    const start = node.type === "orderedList" ? Number(node.attrs?.start) || 1 : 1;
    return (node.content ?? []).map((item, index) => {
      const children = item.content ?? [];
      const body = children.length ? blockMarkdown(children[0], assetSources, depth + 1) : "";
      const nested = children.slice(1).map((child) => blockMarkdown(child, assetSources, depth + 1)).filter(Boolean).join("\n");
      const marker = node.type === "orderedList" ? `${start + index}.` : "-";
      return `${"  ".repeat(depth)}${marker} ${body}${nested ? `\n${nested}` : ""}`;
    }).join("\n");
  }
  if (node.type === "taskList") {
    return (node.content ?? []).map((item) => {
      const children = item.content ?? [];
      const checked = item.attrs?.checked === true ? "x" : " ";
      const body = children.length ? blockMarkdown(children[0], assetSources, depth + 1) : "";
      const nested = children.slice(1).map((child) => blockMarkdown(child, assetSources, depth + 1)).filter(Boolean).join("\n");
      return `${"  ".repeat(depth)}- [${checked}] ${body}${nested ? `\n${nested}` : ""}`;
    }).join("\n");
  }
  if (node.type === "image") {
    const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "image";
    const assetId = typeof node.attrs?.assetId === "string" ? node.attrs.assetId : "";
    const authoredSrc = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const src = assetId && assetSources[assetId] ? assetSources[assetId] : authoredSrc;
    if (src && !src.startsWith("notespace-asset://")) return `![${alt}](${src})`;
    return assetId ? `[Image: ${alt}]` : "";
  }
  return (node.content ?? []).map((child) => blockMarkdown(child, assetSources, depth)).filter(Boolean).join("\n");
}

export function snapshotAssetIds(snapshot: Snapshot): string[] {
  const root = snapshot.data as JsonNode;
  const ids = new Set<string>();
  const visit = (node: JsonNode) => {
    if (node.type === "image" && typeof node.attrs?.assetId === "string" && node.attrs.assetId) ids.add(node.attrs.assetId);
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return [...ids];
}

export function snapshotToMarkdown(snapshot: Snapshot, assetSources: AssetSources = {}): string {
  const root = snapshot.data as JsonNode;
  return (root.content ?? []).map((node) => blockMarkdown(node, assetSources)).filter(Boolean).join("\n\n").trimEnd() + "\n";
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
