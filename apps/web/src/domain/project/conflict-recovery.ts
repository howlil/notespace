import type { Project, ProjectContent } from "./project";

export type WorkspaceConflictDraft = {
  workspaceId: string;
  local: ProjectContent;
  latest: Project;
};

const conflictEvent = "notespace:workspace-conflict";

export function publishWorkspaceConflict(draft: WorkspaceConflictDraft) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WorkspaceConflictDraft>(conflictEvent, { detail: draft }));
}

export function subscribeWorkspaceConflict(listener: (draft: WorkspaceConflictDraft) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<WorkspaceConflictDraft>).detail);
  window.addEventListener(conflictEvent, handle);
  return () => window.removeEventListener(conflictEvent, handle);
}
