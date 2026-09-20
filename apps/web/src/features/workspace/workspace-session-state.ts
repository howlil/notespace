import type { Note, ProjectContent, Snapshot } from "../../domain/project/project";

export function acknowledgeNoteVersion(content: ProjectContent, saved: Note): ProjectContent {
  return {
    ...content,
    notes: content.notes.map((note) => note.id === saved.id ? { ...note, version: saved.version } : note),
  };
}

export function applyNoteDocument(
  content: ProjectContent,
  noteId: string,
  document: Snapshot,
  updatedAt: string,
): { content: ProjectContent; note: Note } | null {
  const existing = content.notes.find((note) => note.id === noteId);
  if (!existing) return null;

  const note: Note = { ...existing, document, updatedAt };
  return {
    note,
    content: {
      ...content,
      document,
      notes: content.notes.map((candidate) => candidate.id === noteId ? note : candidate),
    },
  };
}

export function applyCanvasSnapshot(content: ProjectContent, canvas: Snapshot): ProjectContent {
  return { ...content, canvas };
}
