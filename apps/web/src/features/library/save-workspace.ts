import { pruneLocalImageCache } from "../../adapters/assets/image-store";
import { BlockingAutosaveError } from "../../domain/workspace/autosave";
import { mergeCanvasSnapshots, mergeWorkspaceContent, sameNonCanvasContent, sameWorkspaceContent } from "../../domain/workspace/canvas-merge";
import { publishWorkspaceConflict } from "../../adapters/browser/workspace-conflict-events";
import { APIError } from "../../adapters/http/client";
import { getWorkspace, updateWorkspaceSnapshot } from "../../adapters/http/workspace-api";
import { workspaceContentOf } from "../../domain/workspace/workspace";
import type { Workspace, WorkspaceContent } from "../../domain/workspace/workspace";

export class WorkspaceConflictError extends BlockingAutosaveError {
  readonly latest: Workspace;

  constructor(latest: Workspace) {
    super("This workspace changed elsewhere. Autosave is paused and your local draft is still open for recovery.");
    this.name = "WorkspaceConflictError";
    this.latest = latest;
  }
}

function assetIDs(project: Workspace) {
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if ((key === "assetId" || key === "fileId") && value) ids.add(value);
      if (key === "src" && value.startsWith("notespace-asset://")) ids.add(value.slice("notespace-asset://".length));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) visit(child, childKey);
  };
  visit(project.document);
  visit(project.notes);
  visit(project.canvas);
  visit(project.references);
  return ids;
}

function reconcileAssetCache(project: Workspace) {
  // This is browser cache hygiene, not part of durable acknowledgement. Keeping
  // it off the save critical path prevents IndexedDB scans from extending the
  // time the editor reports Saving… or delaying navigation.
  void pruneLocalImageCache(project.id, assetIDs(project)).catch(() => {});
}

function conflict(id: string, local: WorkspaceContent, latest: Workspace): never {
  publishWorkspaceConflict({ workspaceId: id, local, latest });
  throw new WorkspaceConflictError(latest);
}

/**
 * Persist the latest coalesced workspace snapshot. A stale write caused by an
 * unrelated remote field is rebased when the caller supplies the last
 * acknowledged base. Canvas edits are merged with Excalidraw element semantics.
 * True concurrent edits to the same non-Canvas field still stop autosave and
 * surface the explicit local-draft recovery path.
 */
export async function saveWorkspace(id: string, content: WorkspaceContent, version: number, base?: WorkspaceContent) {
  let candidate = content;
  let candidateVersion = version;
  let candidateBase = base;
  let latest: Workspace | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const saved = await updateWorkspaceSnapshot(id, candidate, candidateVersion);
      reconcileAssetCache(saved);
      return saved;
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 409) throw error;

      latest = await getWorkspace(id);
      if (sameWorkspaceContent(candidate, latest)) {
        reconcileAssetCache(latest);
        return latest;
      }

      if (candidateBase) {
        const rebased = mergeWorkspaceContent(candidateBase, candidate, workspaceContentOf(latest));
        if (!rebased) conflict(id, candidate, latest);
        candidate = rebased;
        candidateBase = workspaceContentOf(latest);
      } else {
        if (!sameNonCanvasContent(candidate, latest)) {
          conflict(id, candidate, latest);
        }
        candidate = {
          ...candidate,
          canvas: mergeCanvasSnapshots(candidate.canvas, latest.canvas),
        };
      }
      candidateVersion = latest.version;
    }
  }

  conflict(id, candidate, latest ?? await getWorkspace(id));
}
