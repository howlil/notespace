import type { Note, Project, ProjectContent, Snapshot } from "./project";

export type WorkspaceConflictDraft = {
  workspaceId: string;
  local: ProjectContent;
  latest: Project;
};

export type GranularConflictDraft =
  | {
      kind: "note";
      workspaceId: string;
      noteId: string;
      local: Pick<Note, "title" | "document" | "version">;
    }
  | {
      kind: "canvas";
      workspaceId: string;
      local: Snapshot;
      latest?: Snapshot;
      latestVersion?: number;
    };

export type ConflictDraft =
  | ({ kind: "workspace" } & WorkspaceConflictDraft)
  | GranularConflictDraft;

const conflictEvent = "notespace:workspace-conflict";

function publishConflict(draft: ConflictDraft) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ConflictDraft>(conflictEvent, { detail: draft }));
}

export function publishWorkspaceConflict(draft: WorkspaceConflictDraft) {
  publishConflict({ kind: "workspace", ...draft });
}

export function publishGranularConflict(draft: GranularConflictDraft) {
  publishConflict(draft);
}

export function subscribeWorkspaceConflict(listener: (draft: ConflictDraft) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<ConflictDraft>).detail);
  window.addEventListener(conflictEvent, handle);
  return () => window.removeEventListener(conflictEvent, handle);
}
