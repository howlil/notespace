export interface Snapshot {
  format: string;
  version: number;
  data: Record<string, unknown>;
}

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Project extends ProjectSummary {
  document: Snapshot;
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
  "title" | "document" | "canvas" | "references" | "splitRatio"
>;

export function contentOf(project: Project): ProjectContent {
  return {
    title: project.title,
    document: project.document,
    canvas: project.canvas,
    references: project.references,
    splitRatio: project.splitRatio,
  };
}
