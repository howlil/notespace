import { pruneLocalImageCache } from "../../adapters/assets/image-store";
import { publishWorkspaceConflict } from "../../adapters/browser/workspace-conflict-events";
import { getWorkspace, updateWorkspaceSnapshot } from "../../adapters/http/workspace-api";
import type { Workspace, WorkspaceContent } from "../../domain/workspace/workspace";
import {
  saveWorkspaceWith,
  type SaveWorkspaceDependencies,
} from "./save-workspace-core";

export { WorkspaceConflictError } from "./save-workspace-core";

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

const defaultSaveWorkspaceDependencies: SaveWorkspaceDependencies = {
  update: updateWorkspaceSnapshot,
  getLatest: getWorkspace,
  publishConflict: publishWorkspaceConflict,
  reconcileAssets: reconcileAssetCache,
};

export function saveWorkspace(
  id: string,
  content: WorkspaceContent,
  version: number,
  base?: WorkspaceContent,
) {
  return saveWorkspaceWith(defaultSaveWorkspaceDependencies, id, content, version, base);
}
