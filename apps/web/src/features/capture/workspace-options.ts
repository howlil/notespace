import type { CategorySummary, WorkspaceSummary } from "../../domain/workspace/workspace";

export type CaptureWorkspaceOption = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle?: string;
};

export function workspaceOptions(workspaces: WorkspaceSummary[], categories: CategorySummary[]): CaptureWorkspaceOption[] {
  const categoryById = new Map(categories.map((category) => [category.id, category.title]));
  return workspaces.map((workspace) => ({
    id: workspace.id,
    title: workspace.title,
    categoryId: workspace.categoryId,
    categoryTitle: categoryById.get(workspace.categoryId),
  }));
}
