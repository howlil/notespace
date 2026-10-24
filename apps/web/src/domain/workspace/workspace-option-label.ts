import type { WorkspaceSummary } from "./workspace";

type WorkspaceOption = Pick<WorkspaceSummary, "id" | "title">;

/** Distinguish same-name Workspaces in destination pickers without changing IDs. */
export function workspaceOptionLabel(
  workspace: WorkspaceOption,
  allWorkspaces: readonly WorkspaceOption[],
): string {
  const duplicated = allWorkspaces.some((other) =>
    other.id !== workspace.id &&
    other.title.trim().toLocaleLowerCase() === workspace.title.trim().toLocaleLowerCase(),
  );
  if (!duplicated) return workspace.title;
  return `${workspace.title} · ${workspace.id.slice(0, 8)}`;
}
