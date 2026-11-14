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
    if (!result.workspaceId) return "/";
    return `/workspaces/${encodeURIComponent(result.workspaceId)}?noteId=${encodeURIComponent(result.noteId)}`;
  }
  return `/workspaces/${encodeURIComponent(result.workspaceId)}`;
}

function noteTitleFromExcerpt(excerpt: string): string {
  const firstLine = excerpt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Canvas Note";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

export function destinationFromSearchResult(result: SearchResult): QuickOpenDestination {
  const key = result.type === "note"
    ? `note-${result.workspaceId}-${result.noteId ?? ""}-${result.instanceId ?? ""}`
    : `${result.type}-${result.categoryId ?? ""}-${result.workspaceId}`;
  return {
    key,
    title: result.type === "category"
      ? result.categoryTitle || "Category"
      : result.type === "note" ? noteTitleFromExcerpt(result.excerpt) : result.workspaceTitle,
    context: result.type === "category"
      ? "Category"
      : result.type === "note" ? result.workspaceTitle || "Unplaced Canvas Note" : result.categoryTitle || "Workspace",
    href: searchResultHref(result),
    kind: result.type,
    categoryId: result.type === "category" ? result.categoryId : undefined,
    workspaceId: result.workspaceId,
    noteId: result.noteId,
  };
}
