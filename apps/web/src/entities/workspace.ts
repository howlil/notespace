export const UNCATEGORIZED_CATEGORY_ID = "legacy";

export interface Snapshot {
  format: string;
  version: number;
  data: Record<string, unknown>;
}

export interface WorkspaceSummary {
  id: string;
  parentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  childCount: number;
  noteCount?: number;
  hasCanvas?: boolean;
}

export interface WorkspacePage {
  items: WorkspaceSummary[];
  total: number;
  offset: number;
  limit: number;
  nextOffset?: number;
  snapshot?: string;
}

export interface Workspace extends WorkspaceSummary {
  canvas: Snapshot;
  canvasVersion: number;
  ancestors?: WorkspaceSummary[];
  restoredToRoot?: boolean;
}

export type WorkspaceContent = Pick<
  Workspace,
  "title" | "canvas"
>;

export function workspaceContentOf(project: Workspace): WorkspaceContent {
  return {
    title: project.title,
    canvas: project.canvas,
  };
}
