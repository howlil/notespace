// Stable persisted category key used by older SQLite libraries and backups.
// This is a schema identifier, not a user-facing product label.
export const UNCATEGORIZED_CATEGORY_ID = "legacy";

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
  snapshot?: string;
}

export interface CategorySummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspaceCount: number;
}

export interface Workspace extends WorkspaceSummary {
  canvas: Snapshot;
  canvasVersion: number;
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
