import { pruneLocalImageCache } from "../assets/local-image-assets";
import { mergeCanvasSnapshots, sameNonCanvasContent, sameProjectContent } from "./canvas-merge";
import type {
  CategorySummary,
  Project,
  ProjectContent,
  ProjectSummary,
  WorkspacePage,
} from "./project";

export class APIError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class WorkspaceConflictError extends Error {
  readonly latest: Project;
  constructor(latest: Project) {
    super("This workspace changed elsewhere while you were editing. Notespace kept both canvas scenes where it could, but another workspace field still conflicts.");
    this.name = "WorkspaceConflictError";
    this.latest = latest;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new APIError(
      response.status,
      body?.error || "Unable to reach Notespace. Please retry.",
      body?.code,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const listProjects = () => request<ProjectSummary[]>("/api/projects");
export const listRecentWorkspaces = (limit = 12) => request<ProjectSummary[]>(`/api/projects?limit=${limit}`);
export const listAllWorkspaces = (params: { query?: string; offset?: number; limit?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.offset) search.set("offset", String(params.offset));
  if (params.limit) search.set("limit", String(params.limit));
  return request<WorkspacePage>(`/api/workspaces?${search}`);
};
export const listCategories = () => request<CategorySummary[]>("/api/categories");
export const getCategory = async (id: string) => {
  const categories = await listCategories();
  const category = categories.find((item) => item.id === id);
  if (!category) throw new APIError(404, "Category not found.");
  return category;
};
export const listCategoryWorkspaces = (categoryId: string, params: { query?: string; sort?: string; hasCanvas?: boolean; hasNotes?: boolean; offset?: number; limit?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.sort) search.set("sort", params.sort);
  if (params.hasCanvas) search.set("hasCanvas", "true");
  if (params.hasNotes) search.set("hasNotes", "true");
  if (params.offset) search.set("offset", String(params.offset));
  if (params.limit) search.set("limit", String(params.limit));
  return request<WorkspacePage>(`/api/categories/${encodeURIComponent(categoryId)}/workspaces?${search}`);
};
export async function listAllCategoryWorkspaces(categoryId: string) {
  const items: ProjectSummary[] = [];
  let offset = 0;
  while (true) {
    const page = await listCategoryWorkspaces(categoryId, { sort: "name", offset, limit: 100 });
    items.push(...page.items);
    if (page.nextOffset === undefined || page.nextOffset <= offset) return items;
    offset = page.nextOffset;
  }
}
export const getProject = (id: string) => request<Project>(`/api/projects/${encodeURIComponent(id)}`);
export const createProject = (title: string, categoryId?: string) => request<Project>("/api/projects", { method: "POST", ...json({ title, ...(categoryId ? { categoryId } : {}) }) });
export const createCategory = (title: string) => request<CategorySummary>("/api/categories", { method: "POST", ...json({ title }) });
export const updateCategory = (id: string, title: string) => request<CategorySummary>(`/api/categories/${encodeURIComponent(id)}`, { method: "PATCH", ...json({ title }) });
export const deleteCategory = (id: string) => request<void>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
export const renameProject = (id: string, title: string) => request<Project>(`/api/projects/${encodeURIComponent(id)}/title`, { method: "PATCH", ...json({ title }) });
export const deleteProject = (id: string) => request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
export const moveProject = (id: string, categoryId: string) => request<Project>(`/api/projects/${encodeURIComponent(id)}/category`, { method: "PATCH", ...json({ categoryId }) });
export type SearchResult = { type: "category" | "workspace" | "note" | "block"; categoryId?: string; categoryTitle?: string; workspaceId: string; workspaceTitle: string; noteId: string; noteTitle: string; blockId: string; excerpt: string };
export const searchNotespace = (query: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`);
export type TrashWorkspace = { id: string; categoryId: string; title: string; deletedAt: string };
export const listTrash = () => request<TrashWorkspace[]>("/api/trash");
export const restoreTrashedWorkspace = (id: string) => request<Project>(`/api/trash/${encodeURIComponent(id)}`, { method: "POST" });
export const deleteTrashedWorkspace = (id: string) => request<void>(`/api/trash/${encodeURIComponent(id)}`, { method: "DELETE" });
export const exportLibraryBackup = () => "/api/backup";
export const restoreLibraryBackup = (file: File) => request<void>("/api/backup/restore", {
  method: "POST",
  headers: { "Content-Type": file.name.toLowerCase().endsWith(".zip") ? "application/zip" : (file.type || "application/json") },
  body: file,
});

export type StudyStats = { todaySeconds: number; totalSeconds: number };
export type StudySession = { id: string; workspaceId: string; workspaceTitleSnapshot: string; activityDate: string; startedAt: string; endedAt: string | null; activeSeconds: number; lastHeartbeatAt: string };
export type StudyDay = { date: string; activeSeconds: number };
export type StudyActivity = { todaySeconds: number; weekSeconds: number; currentStreak: number; days: StudyDay[] };
export type StudyDayDetail = { date: string; activeSeconds: number; workspaces: Array<{ workspaceId: string; title: string; deleted: boolean; activeSeconds: number }> };

export const recordStudyHeartbeat = (workspaceId: string, sessionId: string, body: { activityDate: string; activeSeconds: number; finish: boolean }) => request<StudySession>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study-sessions/${encodeURIComponent(sessionId)}`, { method: "PUT", ...json(body) });
export const getWorkspaceStudy = (workspaceId: string, date: string) => request<StudyStats>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study?date=${encodeURIComponent(date)}`);
export const getStudyActivity = (from: string, to: string) => request<StudyActivity>(`/api/study/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const getStudyDayDetail = (date: string) => request<StudyDayDetail>(`/api/study/activity/${encodeURIComponent(date)}`);

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
      const saved = await request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ ...candidate, version: candidateVersion }),
      });
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
