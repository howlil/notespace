import type { Snapshot } from "./workspace";

export type GranularConflictDraft = {
  kind: "canvas";
  workspaceId: string;
  local: Snapshot;
  latest?: Snapshot;
  latestVersion?: number;
};

export type ConflictDraft = GranularConflictDraft;
