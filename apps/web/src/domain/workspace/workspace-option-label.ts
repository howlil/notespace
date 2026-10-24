import type { WorkspaceSummary } from "./workspace";

type WorkspaceOption = Pick<WorkspaceSummary, "id" | "title">;

/** Distinguish same-name Workspaces in destination pickers without changing IDs. */
export function workspaceOptionLabel(
  workspace: WorkspaceOption,
  allWorkspaces: readonly WorkspaceOption[],
): string {
  const sameTitle = allWorkspaces.filter((other) =>
    other.title.trim().toLocaleLowerCase() === workspace.title.trim().toLocaleLowerCase(),
  );
  if (sameTitle.length <= 1) return workspace.title;
  // Use the shortest prefix unique within this picker; fixed-size prefixes
  // can still collide for imported or manually assigned Workspace IDs.
  let prefixLength = Math.min(6, workspace.id.length);
  while (prefixLength < workspace.id.length && sameTitle.some((other) =>
    other.id !== workspace.id && other.id.slice(0, prefixLength) === workspace.id.slice(0, prefixLength)
  )) prefixLength++;
  return `${workspace.title} · ${workspace.id.slice(0, prefixLength)}`;
}
