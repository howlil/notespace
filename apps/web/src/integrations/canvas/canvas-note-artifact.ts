import type { Note, Snapshot } from "../../domain/project/project";

export const CANVAS_NOTE_ARTIFACT_DATA_KEY = "notespaceNoteArtifact";

export type CanvasNoteArtifactDisplayMode = "compact" | "preview";

export type CanvasNoteArtifactData = {
  version: 1;
  noteId: string;
  displayMode: CanvasNoteArtifactDisplayMode;
};

type CanvasNoteArtifactElementLike = {
  id?: string;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
};

function normalizeCanvasNoteArtifact(value: unknown): CanvasNoteArtifactData | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.noteId !== "string" || !record.noteId.trim()) return null;
  const displayMode = record.displayMode === "compact" ? "compact" : record.displayMode === "preview" ? "preview" : null;
  if (!displayMode) return null;
  return { version: 1, noteId: record.noteId, displayMode };
}

export function readCanvasNoteArtifact(element: CanvasNoteArtifactElementLike | null | undefined) {
  return normalizeCanvasNoteArtifact(element?.customData?.[CANVAS_NOTE_ARTIFACT_DATA_KEY]);
}

export function withCanvasNoteArtifact(
  customData: Record<string, unknown> | undefined,
  artifact: CanvasNoteArtifactData,
) {
  return {
    ...(customData ?? {}),
    [CANVAS_NOTE_ARTIFACT_DATA_KEY]: artifact,
  };
}

export function canvasNoteArtifactElements<T extends CanvasNoteArtifactElementLike>(elements: readonly T[]) {
  return elements.filter((element) => !element.isDeleted && readCanvasNoteArtifact(element) !== null);
}

function snapshotText(snapshot: Snapshot) {
  const chunks: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") chunks.push(record.text);
    if (record.content) visit(record.content);
  };
  visit(snapshot.data);
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export function notePreviewText(note: Pick<Note, "document">, limit = 180) {
  const text = snapshotText(note.document);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function findCanvasNoteArtifactId(snapshot: Snapshot, noteId: string) {
  const elements = Array.isArray(snapshot.data.elements)
    ? snapshot.data.elements as CanvasNoteArtifactElementLike[]
    : [];
  return canvasNoteArtifactElements(elements).find((element) => readCanvasNoteArtifact(element)?.noteId === noteId)?.id ?? null;
}
