import type { CategorySummary, ProjectSummary } from "../../domain/project/project";

export type CaptureWorkspaceOption = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle?: string;
};

export function workspaceOptions(workspaces: ProjectSummary[], categories: CategorySummary[]): CaptureWorkspaceOption[] {
  const categoryById = new Map(categories.map((category) => [category.id, category.title]));
  return workspaces.map((workspace) => ({
    id: workspace.id,
    title: workspace.title,
    categoryId: workspace.categoryId,
    categoryTitle: categoryById.get(workspace.categoryId),
  }));
}
