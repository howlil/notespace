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
  splitRatio: number;
}

export type ProjectContent = Pick<
  Project,
  "title" | "document" | "canvas" | "splitRatio"
>;

export function contentOf(project: Project): ProjectContent {
  return {
    title: project.title,
    document: project.document,
    canvas: project.canvas,
    splitRatio: project.splitRatio,
  };
}
