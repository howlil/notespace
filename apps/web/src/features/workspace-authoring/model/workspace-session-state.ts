import type { Note, WorkspaceContent, Snapshot } from "../../../domain/workspace/workspace";

export function acknowledgeNoteVersion(content: WorkspaceContent, saved: Note): WorkspaceContent {
  return {
    ...content,
    notes: content.notes.map((note) => note.id === saved.id ? { ...note, version: saved.version } : note),
  };
}

export function applyNoteDocument(
  content: WorkspaceContent,
  noteId: string,
  document: Snapshot,
  updatedAt: string,
): { content: WorkspaceContent; note: Note } | null {
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

export function applyCanvasSnapshot(content: WorkspaceContent, canvas: Snapshot): WorkspaceContent {
  return { ...content, canvas };
}
