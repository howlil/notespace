import type {
  CategorySummary,
  Note,
  Workspace,
  WorkspaceContent,
  WorkspaceSummary,
  Snapshot,
  WorkspacePage,
} from "../../domain/workspace/workspace";
import {
  APIError,
  fetchTransport,
  json,
  request,
  type HttpTransport,
} from "./client";

export { APIError } from "./client";

export interface WorkspaceHttpClient {
  getWorkspace(id: string): Promise<Workspace>;
  updateWorkspaceSnapshot(id: string, content: WorkspaceContent, version: number): Promise<Workspace>;
}

export function createWorkspaceHttpClient(
  transport: HttpTransport = fetchTransport,
): WorkspaceHttpClient {
  return {
    getWorkspace: (id) =>
      request<Workspace>(
        `/api/workspaces/${encodeURIComponent(id)}`,
        undefined,
        transport,
      ),
    updateWorkspaceSnapshot: (id, content, version) =>
      request<Workspace>(
        `/api/workspaces/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          ...json({ ...content, version }),
        },
        transport,
      ),
  };
}

const defaultWorkspaceClient = createWorkspaceHttpClient();

export const getWorkspace = defaultWorkspaceClient.getWorkspace;
export const updateWorkspaceSnapshot = defaultWorkspaceClient.updateWorkspaceSnapshot;

export type CanvasState = { canvas: Snapshot; version: number; updatedAt: string };

export const createWorkspaceNote = (workspaceId: string, input: { id: string; title: string; document: Snapshot }) =>
  request<Note>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes`, {
    method: "POST",
    ...json(input),
  });

export const updateWorkspaceNote = (workspaceId: string, noteId: string, input: { title: string; document: Snapshot; version: number }) =>
  request<Note>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    ...json(input),
  });

export const deleteWorkspaceNote = (workspaceId: string, noteId: string, version: number) =>
  request<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers: { "If-Match": `"${version}"` },
  });

export const getWorkspaceCanvas = (workspaceId: string) =>
  request<CanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/canvas`);

export const updateWorkspaceCanvas = (workspaceId: string, canvas: Snapshot, version: number) =>
  request<CanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/canvas`, {
    method: "PATCH",
    ...json({ canvas, version }),
  });


export const listRecentWorkspaces = async (limit = 12) => (await listAllWorkspaces({ limit })).items;
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
  const items: WorkspaceSummary[] = [];
  let offset = 0;
  while (true) {
    const page = await listCategoryWorkspaces(categoryId, { sort: "name", offset, limit: 100 });
    items.push(...page.items);
    if (page.nextOffset === undefined || page.nextOffset <= offset) return items;
    offset = page.nextOffset;
  }
}
export const createWorkspace = (title: string, categoryId?: string) => request<Workspace>("/api/workspaces", { method: "POST", ...json({ title, ...(categoryId ? { categoryId } : {}) }) });
export const createCategory = (title: string) => request<CategorySummary>("/api/categories", { method: "POST", ...json({ title }) });
export const updateCategory = (id: string, title: string) => request<CategorySummary>(`/api/categories/${encodeURIComponent(id)}`, { method: "PATCH", ...json({ title }) });
export const deleteCategory = (id: string) => request<void>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
export const renameWorkspace = (id: string, title: string) => request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}/title`, { method: "PATCH", ...json({ title }) });
export const deleteWorkspace = (id: string, expectedVersion?: number) => request<void>(`/api/workspaces/${encodeURIComponent(id)}`, {
  method: "DELETE",
  ...(expectedVersion === undefined ? {} : { headers: { "If-Match": `"${expectedVersion}"` } }),
});
export const moveWorkspace = (id: string, categoryId: string) => request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}/category`, { method: "PATCH", ...json({ categoryId }) });
export type SearchResult = { type: "category" | "workspace" | "note" | "block"; categoryId?: string; categoryTitle?: string; workspaceId: string; workspaceTitle: string; noteId: string; noteTitle: string; blockId: string; excerpt: string };
export const searchNotespace = (query: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`);
export type TrashWorkspace = { id: string; categoryId: string; title: string; deletedAt: string };
export const listTrash = () => request<TrashWorkspace[]>("/api/trash");
export const restoreTrashedWorkspace = (id: string) => request<Workspace>(`/api/trash/${encodeURIComponent(id)}`, { method: "POST" });
export const deleteTrashedWorkspace = (id: string) => request<void>(`/api/trash/${encodeURIComponent(id)}`, { method: "DELETE" });
export const exportLibraryBackup = () => "/api/backup";
export const restoreLibraryBackup = (file: File) => request<void>("/api/backup/restore", {
  method: "POST",
  headers: { "Content-Type": file.name.toLowerCase().endsWith(".zip") ? "application/zip" : (file.type || "application/json") },
  body: file,
  signal: AbortSignal.timeout(120_000),
});

export type StudyStats = { todaySeconds: number; totalSeconds: number };
export type StudySession = { id: string; workspaceId: string; workspaceTitleSnapshot: string; activityDate: string; startedAt: string; endedAt: string | null; activeSeconds: number; lastHeartbeatAt: string };
export type StudyDay = { date: string; activeSeconds: number };
export type StudyActivity = { todaySeconds: number; weekSeconds: number; currentStreak: number; days: StudyDay[] };
export type StudyDayDetail = { date: string; activeSeconds: number; workspaces: Array<{ workspaceId: string; title: string; deleted: boolean; activeSeconds: number }> };

export const listStudySessions = (workspaceId: string, limit = 8) => request<StudySession[]>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study-sessions?limit=${limit}`);
export const recordStudyHeartbeat = (workspaceId: string, sessionId: string, body: { activityDate: string; activeSeconds: number; finish: boolean }) => request<StudySession>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study-sessions/${encodeURIComponent(sessionId)}`, { method: "PUT", ...json(body) });
export const deleteStudySession = (workspaceId: string, sessionId: string) => request<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study-sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
export const getWorkspaceStudy = (workspaceId: string, date: string) => request<StudyStats>(`/api/workspaces/${encodeURIComponent(workspaceId)}/study?date=${encodeURIComponent(date)}`);
export const getStudyActivity = (from: string, to: string) => request<StudyActivity>(`/api/study/activity?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
export const getStudyDayDetail = (date: string) => request<StudyDayDetail>(`/api/study/activity/${encodeURIComponent(date)}`);
