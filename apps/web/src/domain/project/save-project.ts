import { pruneLocalImageCache } from "../assets/local-image-assets";
import { BlockingAutosaveError } from "./autosave";
import { mergeCanvasSnapshots, sameNonCanvasContent, sameProjectContent } from "./canvas-merge";
import { APIError, getProject, updateProjectSnapshot } from "./api";
import type { Project, ProjectContent } from "./project";

export class WorkspaceConflictError extends BlockingAutosaveError {
  readonly latest: Project;

  constructor(latest: Project) {
    super("This workspace changed elsewhere while you were editing. Notespace kept both canvas scenes where it could, but another workspace field still conflicts.");
    this.name = "WorkspaceConflictError";
    this.latest = latest;
  }
}

function assetIDs(project: Project) {
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

async function reconcileAssetCache(project: Project) {
  await pruneLocalImageCache(project.id, assetIDs(project));
}

/**
 * Persist the latest coalesced workspace snapshot. A stale write caused only by
 * concurrent Canvas edits is reconciled and retried against the newest server
 * version instead of blocking the editor. Conflicts in notes/title/layout are
 * still surfaced because blindly merging those would risk silent data loss.
 */
export async function saveProject(id: string, content: ProjectContent, version: number) {
  let candidate = content;
  let candidateVersion = version;
  let latest: Project | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const saved = await updateProjectSnapshot(id, candidate, candidateVersion);
      await reconcileAssetCache(saved);
      return saved;
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 409) throw error;

      latest = await getProject(id);
      if (sameProjectContent(candidate, latest)) {
        await reconcileAssetCache(latest);
        return latest;
      }
      if (!sameNonCanvasContent(candidate, latest)) {
        throw new WorkspaceConflictError(latest);
      }

      candidate = {
        ...candidate,
        canvas: mergeCanvasSnapshots(candidate.canvas, latest.canvas),
      };
      candidateVersion = latest.version;
    }
  }

  throw new WorkspaceConflictError(latest ?? await getProject(id));
}
