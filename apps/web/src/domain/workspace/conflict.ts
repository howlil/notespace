import type { Note, Workspace, WorkspaceContent, Snapshot } from "./workspace";

export type WorkspaceConflictDraft = {
  workspaceId: string;
  local: WorkspaceContent;
  latest: Workspace;
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
