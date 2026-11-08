import type { SearchResult } from "../../adapters/http/workspace-api";

export type QuickOpenDestination = {
  key: string;
  title: string;
  context: string;
  href: string;
  kind: "category" | "workspace";
  categoryId?: string;
  workspaceId?: string;
};

export function searchResultHref(result: SearchResult) {
  if (result.type === "category" && result.categoryId) {
    return `/?category=${encodeURIComponent(result.categoryId)}`;
  }
  if (result.type === "workspace") {
    return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
  }
  return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
}

export function destinationFromSearchResult(result: SearchResult): QuickOpenDestination {
  return {
    key: `${result.type}-${result.categoryId ?? ""}-${result.workspaceId}`,
    title: result.type === "category"
      ? result.categoryTitle || "Category"
      : result.workspaceTitle,
    context: result.type === "category"
      ? "Category"
      : result.categoryTitle || "Workspace",
    href: searchResultHref(result),
    kind: result.type,
    categoryId: result.type === "category" ? result.categoryId : undefined,
    workspaceId: result.workspaceId,
  };
}
