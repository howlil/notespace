import type { SearchResult } from "../../platform/api/workspace-api";

export type QuickOpenDestination = {
  key: string;
  title: string;
  context: string;
  href: string;
  kind: "workspace" | "note";
  workspaceId?: string;
  noteId?: string;
};

export type QuickOpenAction =
  | { type: "navigate-workspace"; workspaceId: string; noteId?: string }
  | { type: "place-note"; noteId: string }
  | { type: "toast-unplaced-note"; message: string };

export const UNPLACED_NOTE_TOAST_MESSAGE = "Open a Workspace to place this unplaced Note.";

export function searchResultHref(result: SearchResult) {
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
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find(Boolean);
  if (!firstLine) return "Canvas Note";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117).trimEnd()}...` : firstLine;
}

export function destinationFromSearchResult(result: SearchResult): QuickOpenDestination {
  const key = result.type === "note"
    ? `note-${result.workspaceId}-${result.noteId ?? ""}-${result.instanceId ?? ""}`
    : `${result.type}-${result.workspaceId}`;
  return {
    key,
    title: result.type === "note" ? noteTitleFromExcerpt(result.excerpt) : result.workspaceTitle,
    context: result.type === "note"
      ? result.workspaceTitle || "Unplaced Canvas Note"
      : result.parentTitle || "Root workspace",
    href: searchResultHref(result),
    kind: result.type,
    workspaceId: result.workspaceId || undefined,
    noteId: result.noteId,
  };
}

export function resolveQuickOpenAction(
  destination: QuickOpenDestination | undefined,
  options: { canPlaceOnCanvas: boolean },
): QuickOpenAction | null {
  if (!destination) return null;
  if (destination.kind === "note" && !destination.workspaceId) {
    if (options.canPlaceOnCanvas && destination.noteId) {
      return { type: "place-note", noteId: destination.noteId };
    }
    return { type: "toast-unplaced-note", message: UNPLACED_NOTE_TOAST_MESSAGE };
  }
  if (destination.workspaceId) {
    return {
      type: "navigate-workspace",
      workspaceId: destination.workspaceId,
      noteId: destination.kind === "note" ? destination.noteId : undefined,
    };
  }
  return null;
}
