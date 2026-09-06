import type { ProjectContent, Snapshot } from "../../domain/project/project";

const BLOCK_TYPES_WITH_IDENTITY = new Set(["paragraph", "heading", "codeBlock", "listItem", "taskItem"]);

function newId(): string {
  return crypto.randomUUID();
}

export function blankDocument(blockId: string = newId()): Snapshot {
  return { format: "tiptap", version: 1, data: { type: "doc", content: [{ type: "paragraph", attrs: { blockId } }] } };
}

function normalizeDocument(snapshot: Snapshot) {
  let changed = false;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    let next = record;
    if (typeof record.type === "string" && BLOCK_TYPES_WITH_IDENTITY.has(record.type)) {
      const attrs = record.attrs && typeof record.attrs === "object" ? record.attrs as Record<string, unknown> : {};
      if (typeof attrs.blockId !== "string" || !attrs.blockId) {
        next = { ...next, attrs: { ...attrs, blockId: newId() } };
        changed = true;
      }
    }
    const childContent = next.content;
    if (Array.isArray(childContent)) {
      const content = childContent.map(visit);
      if (content.some((item, index) => item !== childContent[index])) next = { ...next, content };
    }
    return next;
  };
  const data = visit(snapshot.data) as Record<string, unknown>;
  return { snapshot: changed ? { ...snapshot, data } : snapshot, changed };
}

export function normalizeProjectContent(content: ProjectContent) {
  const document = normalizeDocument(content.document);
  let changed = document.changed || content.references.length > 0;
  const notes = content.notes.map((note) => {
    const result = normalizeDocument(note.document);
    changed ||= result.changed;
    return result.changed ? { ...note, document: result.snapshot } : note;
  });
  const normalized: ProjectContent = {
    ...content,
    document: document.snapshot,
    notes,
    // Cross-surface Send/Link was removed from the product. Keep the legacy
    // wire field empty until the compatibility schema can be retired safely.
    references: [],
  };
  return { content: normalized, changed };
}

export function documentText(snapshot: Snapshot) {
  let result = "";
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") result += `${record.text} `;
    if (record.content) visit(record.content);
  };
  visit(snapshot.data);
  return result.trim();
}

export function canvasObjectCount(snapshot: Snapshot) {
  return Array.isArray(snapshot.data.elements)
    ? snapshot.data.elements.filter((value) => value && typeof value === "object" && (value as Record<string, unknown>).isDeleted !== true).length
    : 0;
}
