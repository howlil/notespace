import type { SearchResult } from "../../domain/project/api";
import type { CategorySummary, ProjectSummary } from "../../domain/project/project";

export type CaptureWorkspaceOption = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle?: string;
};

export function searchWorkspaceOptions(results: SearchResult[]): CaptureWorkspaceOption[] {
  const seen = new Set<string>();
  const options: CaptureWorkspaceOption[] = [];
  for (const result of results) {
    if (!result.workspaceId || seen.has(result.workspaceId)) continue;
    seen.add(result.workspaceId);
    options.push({
      id: result.workspaceId,
      title: result.workspaceTitle || "Untitled",
      categoryId: result.categoryId ?? "",
      categoryTitle: result.categoryTitle,
    });
  }
  return options;
}

export function recentWorkspaceOptions(workspaces: ProjectSummary[], categories: CategorySummary[]): CaptureWorkspaceOption[] {
  const categoryById = new Map(categories.map((category) => [category.id, category.title]));
  return workspaces.map((workspace) => ({
    id: workspace.id,
    title: workspace.title,
    categoryId: workspace.categoryId,
    categoryTitle: categoryById.get(workspace.categoryId),
  }));
}
