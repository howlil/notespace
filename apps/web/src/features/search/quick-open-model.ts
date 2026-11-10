import type { SearchResult } from "../../adapters/http/workspace-api";

export type QuickOpenDestination = {
  key: string;
  title: string;
  context: string;
  href: string;
  kind: "category" | "workspace" | "note";
  categoryId?: string;
  workspaceId?: string;
  noteId?: string;
};

export function searchResultHref(result: SearchResult) {
  if (result.type === "category" && result.categoryId) {
    return `/?category=${encodeURIComponent(result.categoryId)}`;
  }
  if (result.type === "workspace") {
    return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
  }
  if (result.type === "note" && result.noteId) {
    return `/workspaces/${encodeURIComponent(result.workspaceId)}?noteId=${encodeURIComponent(result.noteId)}`;
  }
  return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
}

export function destinationFromSearchResult(result: SearchResult): QuickOpenDestination {
  return {
    key: `${result.type}-${result.categoryId ?? ""}-${result.workspaceId}`,
    title: result.type === "category"
      ? result.categoryTitle || "Category"
      : result.type === "note" ? "Canvas Note" : result.workspaceTitle,
    context: result.type === "category"
      ? "Category"
      : result.type === "note" ? result.workspaceTitle : result.categoryTitle || "Workspace",
    href: searchResultHref(result),
    kind: result.type,
    categoryId: result.type === "category" ? result.categoryId : undefined,
    workspaceId: result.workspaceId,
    noteId: result.noteId,
  };
}
