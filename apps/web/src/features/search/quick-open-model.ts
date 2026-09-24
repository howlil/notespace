import type { SearchResult } from "../../adapters/http/workspace-api";

export type QuickOpenDestination = {
  key: string;
  title: string;
  context: string;
  href: string;
  kind: "category" | "workspace" | "note" | "block";
};

export function searchResultHref(result: SearchResult) {
  if (result.type === "category" && result.categoryId) {
    return `/?category=${encodeURIComponent(result.categoryId)}`;
  }
  if (result.type === "workspace") {
    return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
  }
  return `/workspaces/${encodeURIComponent(result.workspaceId)}?note=${encodeURIComponent(result.noteId)}${result.blockId ? `&block=${encodeURIComponent(result.blockId)}` : ""}`;
}

export function destinationFromSearchResult(result: SearchResult): QuickOpenDestination {
  return {
    key: `${result.type}-${result.categoryId ?? ""}-${result.workspaceId}-${result.noteId}-${result.blockId}`,
    title: result.type === "category"
      ? result.categoryTitle || "Category"
      : result.type === "workspace"
        ? result.workspaceTitle
        : result.noteTitle,
    context: result.type === "category"
      ? "Category"
      : result.type === "workspace"
        ? result.categoryTitle || "Workspace"
        : `${result.workspaceTitle} · ${result.excerpt || "Open note"}`,
    href: searchResultHref(result),
    kind: result.type,
  };
}
