export interface Snapshot {
  format: string;
  version: number;
  data: Record<string, unknown>;
}

export interface ProjectSummary {
  id: string;
  categoryId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
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
}

export interface Project extends ProjectSummary {
  document: Snapshot;
  notes: Note[];
  canvas: Snapshot;
  references: ProjectReference[];
  splitRatio: number;
}

export interface ProjectReference {
  id: string;
  blockId: string;
  elementId: string;
}

export type ProjectContent = Pick<
  Project,
  "title" | "document" | "notes" | "canvas" | "references" | "splitRatio"
>;

export function contentOf(project: Project): ProjectContent {
  return {
    title: project.title,
    document: project.document,
    notes: project.notes?.length ? project.notes : [{
      id: `${project.id}-default`,
      title: "Untitled",
      document: project.document,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }],
    canvas: project.canvas,
    references: project.references,
    splitRatio: project.splitRatio,
  };
}
