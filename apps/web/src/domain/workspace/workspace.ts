export interface Snapshot {
  format: string;
  version: number;
  data: Record<string, unknown>;
}

export interface WorkspaceSummary {
  id: string;
  categoryId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  noteCount?: number;
  hasCanvas?: boolean;
}

export interface WorkspacePage {
  items: WorkspaceSummary[];
  total: number;
  offset: number;
  limit: number;
  nextOffset?: number;
}

export interface CategorySummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspaceCount: number;
}

export interface Note {
  id: string;
  title: string;
  document: Snapshot;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Workspace extends WorkspaceSummary {
  document: Snapshot;
  notes: Note[];
  canvas: Snapshot;
  canvasVersion: number;
  references: WorkspaceReference[];
  splitRatio: number;
}

export interface WorkspaceReference {
  id: string;
  noteId?: string;
  blockId: string;
  elementId: string;
}

export type WorkspaceContent = Pick<
  Workspace,
  "title" | "document" | "notes" | "canvas" | "references" | "splitRatio"
>;

export function workspaceContentOf(project: Workspace): WorkspaceContent {
  return {
    title: project.title,
    document: project.document,
    notes: project.notes?.length ? project.notes : [{
      id: `${project.id}-default`,
      title: "Untitled",
      document: project.document,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      version: 1,
    }],
    canvas: project.canvas,
    references: project.references,
    splitRatio: project.splitRatio,
  };
}
