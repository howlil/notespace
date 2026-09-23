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
