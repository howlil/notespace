import { APIError } from "../../adapters/http/client.ts";
import { BlockingAutosaveError } from "../../domain/workspace/autosave.ts";
import {
  mergeCanvasSnapshots,
  mergeWorkspaceContent,
  sameNonCanvasContent,
  sameWorkspaceContent,
} from "../../domain/workspace/canvas-merge.ts";
import { workspaceContentOf } from "../../domain/workspace/workspace.ts";
import type { WorkspaceConflictDraft } from "../../domain/workspace/conflict.ts";
import type { Workspace, WorkspaceContent } from "../../domain/workspace/workspace.ts";

export class WorkspaceConflictError extends BlockingAutosaveError {
  readonly latest: Workspace;

  constructor(latest: Workspace) {
    super("This workspace changed elsewhere. Autosave is paused and your local draft is still open for recovery.");
    this.name = "WorkspaceConflictError";
    this.latest = latest;
  }
}

export type SaveWorkspaceDependencies = {
  update: (id: string, content: WorkspaceContent, version: number) => Promise<Workspace>;
  getLatest: (id: string) => Promise<Workspace>;
  publishConflict: (draft: WorkspaceConflictDraft) => void;
  reconcileAssets: (workspace: Workspace) => void;
};

function conflict(
  deps: SaveWorkspaceDependencies,
  id: string,
  local: WorkspaceContent,
  latest: Workspace,
): never {
  deps.publishConflict({ workspaceId: id, local, latest });
  throw new WorkspaceConflictError(latest);
}

export async function saveWorkspaceWith(
  deps: SaveWorkspaceDependencies,
  id: string,
  content: WorkspaceContent,
  version: number,
  base?: WorkspaceContent,
) {
  let candidate = content;
  let candidateVersion = version;
  let candidateBase = base;
  let latest: Workspace | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const saved = await deps.update(id, candidate, candidateVersion);
      deps.reconcileAssets(saved);
      return saved;
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 409) throw error;

      latest = await deps.getLatest(id);
      if (sameWorkspaceContent(candidate, latest)) {
        deps.reconcileAssets(latest);
        return latest;
      }

      if (candidateBase) {
        const rebased = mergeWorkspaceContent(
          candidateBase,
          candidate,
          workspaceContentOf(latest),
        );
        if (!rebased) conflict(deps, id, candidate, latest);
        candidate = rebased;
        candidateBase = workspaceContentOf(latest);
      } else {
        if (!sameNonCanvasContent(candidate, latest)) {
          conflict(deps, id, candidate, latest);
        }
        candidate = {
          ...candidate,
          canvas: mergeCanvasSnapshots(candidate.canvas, latest.canvas),
        };
      }
      candidateVersion = latest.version;
    }
  }

  conflict(deps, id, candidate, latest ?? await deps.getLatest(id));
}
