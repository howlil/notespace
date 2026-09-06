import type { Snapshot } from "../../domain/project/project";
import { markdownToSnapshot } from "../../domain/document/markdown";

export type ResolvedVaultImage = { assetId: string; src: string };
export type VaultImageResolver = (source: string) => ResolvedVaultImage | null;

type JsonNode = { type?: string; content?: JsonNode[]; attrs?: Record<string, unknown> };

export function normalizeVaultPath(value: string) {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function resolveVaultReference(markdownPath: string, source: string) {
  const cleanSource = decodeURIComponent(source.trim().replace(/^<|>$/g, "")).split(/[?#]/, 1)[0];
  if (!cleanSource || /^(?:[a-z]+:|\/)/i.test(cleanSource)) return null;
  const base = normalizeVaultPath(markdownPath).split("/").slice(0, -1).join("/");
  return normalizeVaultPath(base ? `${base}/${cleanSource}` : cleanSource);
}

function contentOf(snapshot: Snapshot) {
  const root = snapshot.data as JsonNode;
  return Array.isArray(root.content) ? root.content : [];
}

// Existing Markdown parsing remains authoritative. This adapter only interleaves
// standalone image embeds so selected vault assets become native Notespace image nodes.
export function markdownWithVaultImages(markdown: string, resolveImage: VaultImageResolver): Snapshot {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const content: JsonNode[] = [];
  let chunk: string[] = [];

  const flush = () => {
    const value = chunk.join("\n").trim();
    chunk = [];
    if (!value) return;
    content.push(...contentOf(markdownToSnapshot(value)));
  };

  for (const line of lines) {
    const markdownImage = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    const obsidianImage = line.match(/^\s*!\[\[([^|\]]+)(?:\|([^\]]+))?\]\]\s*$/);
    const source = markdownImage?.[2] ?? obsidianImage?.[1];
    if (!source) {
      chunk.push(line);
      continue;
    }
    const resolved = resolveImage(source);
    if (!resolved) {
      chunk.push(line);
      continue;
    }
    flush();
    const sourceBasename = source.split("/").pop()?.replace(/\.[^.]+$/, "") || "Imported image";
    content.push({
      type: "image",
      attrs: {
        assetId: resolved.assetId,
        src: resolved.src,
        alt: markdownImage?.[1] || obsidianImage?.[2] || sourceBasename,
      },
    });
  }
  flush();

  if (!content.length) return markdownToSnapshot("");
  return { format: "tiptap", version: 1, data: { type: "doc", content } };
}

export function importedDocumentTitle(path: string, markdown: string) {
  const heading = markdown.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).find(Boolean)?.match(/^#{1,3}\s+(.+)$/)?.[1]?.trim();
  if (heading) return heading.slice(0, 160);
  const basename = normalizeVaultPath(path).split("/").pop() ?? "Imported note";
  return basename.replace(/\.(?:md|markdown)$/i, "").trim().slice(0, 160) || "Imported note";
}
