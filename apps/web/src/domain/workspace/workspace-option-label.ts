import type { WorkspaceSummary } from "./workspace";

/** Distinguish same-name Workspaces in destination pickers without changing IDs. */
export function workspaceOptionLabel(
  workspace: WorkspaceSummary,
  allWorkspaces: readonly WorkspaceSummary[],
): string {
  const duplicated = allWorkspaces.some((other) =>
    other.id !== workspace.id &&
    other.title.trim().toLocaleLowerCase() === workspace.title.trim().toLocaleLowerCase(),
  );
  if (!duplicated) return workspace.title;
  return `${workspace.title} · ${workspace.id.slice(0, 8)}`;
}
