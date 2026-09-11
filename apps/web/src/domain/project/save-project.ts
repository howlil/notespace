import { pruneLocalImageCache } from "../assets/local-image-assets";
import { BlockingAutosaveError } from "./autosave";
import { mergeCanvasSnapshots, mergeProjectContent, sameNonCanvasContent, sameProjectContent } from "./canvas-merge";
import { publishWorkspaceConflict } from "./conflict-recovery";
import { APIError, getProject, updateProjectSnapshot } from "./http";
import { contentOf } from "./project";
import type { Project, ProjectContent } from "./project";

export class WorkspaceConflictError extends BlockingAutosaveError {
  readonly latest: Project;

  constructor(latest: Project) {
    super("This workspace changed elsewhere. Autosave is paused and your local draft is still open for recovery.");
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

function reconcileAssetCache(project: Project) {
  // This is browser cache hygiene, not part of durable acknowledgement. Keeping
  // it off the save critical path prevents IndexedDB scans from extending the
  // time the editor reports Saving… or delaying navigation.
  void pruneLocalImageCache(project.id, assetIDs(project)).catch(() => {});
}

function conflict(id: string, local: ProjectContent, latest: Project): never {
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
export async function saveProject(id: string, content: ProjectContent, version: number, base?: ProjectContent) {
  let candidate = content;
  let candidateVersion = version;
  let candidateBase = base;
  let latest: Project | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const saved = await updateProjectSnapshot(id, candidate, candidateVersion);
      reconcileAssetCache(saved);
      return saved;
    } catch (error) {
      if (!(error instanceof APIError) || error.status !== 409) throw error;

      latest = await getProject(id);
      if (sameProjectContent(candidate, latest)) {
        reconcileAssetCache(latest);
        return latest;
      }

      if (candidateBase) {
        const rebased = mergeProjectContent(candidateBase, candidate, contentOf(latest));
        if (!rebased) conflict(id, candidate, latest);
        candidate = rebased;
        candidateBase = contentOf(latest);
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

  conflict(id, candidate, latest ?? await getProject(id));
}
