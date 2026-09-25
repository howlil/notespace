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
} from "./client.ts";

export { APIError } from "./client.ts";

export type CanvasState = { canvas: Snapshot; version: number; updatedAt: string };
export type SearchResult = { type: "category" | "workspace" | "note" | "block"; categoryId?: string; categoryTitle?: string; workspaceId: string; workspaceTitle: string; noteId: string; noteTitle: string; blockId: string; excerpt: string };
export type TrashWorkspace = { id: string; categoryId: string; title: string; deletedAt: string };

export interface WorkspaceHttpClient {
  getWorkspace(id: string): Promise<Workspace>;
  updateWorkspaceSnapshot(id: string, content: WorkspaceContent, version: number): Promise<Workspace>;
  createWorkspaceNote(workspaceId: string, input: { id: string; title: string; document: Snapshot }): Promise<Note>;
  updateWorkspaceNote(workspaceId: string, noteId: string, input: { title: string; document: Snapshot; version: number }): Promise<Note>;
  deleteWorkspaceNote(workspaceId: string, noteId: string, version: number): Promise<void>;
  getWorkspaceCanvas(workspaceId: string): Promise<CanvasState>;
  updateWorkspaceCanvas(workspaceId: string, canvas: Snapshot, version: number): Promise<CanvasState>;
  listAllWorkspaces(params?: { query?: string; offset?: number; limit?: number }): Promise<WorkspacePage>;
  listCategories(): Promise<CategorySummary[]>;
  listCategoryWorkspaces(categoryId: string, params?: { query?: string; sort?: string; hasCanvas?: boolean; hasNotes?: boolean; offset?: number; limit?: number }): Promise<WorkspacePage>;
  createWorkspace(title: string, categoryId?: string): Promise<Workspace>;
  createCategory(title: string): Promise<CategorySummary>;
  updateCategory(id: string, title: string): Promise<CategorySummary>;
  deleteCategory(id: string): Promise<void>;
  renameWorkspace(id: string, title: string): Promise<Workspace>;
  deleteWorkspace(id: string, expectedVersion: number): Promise<void>;
  moveWorkspace(id: string, categoryId: string): Promise<Workspace>;
  searchNotespace(query: string): Promise<SearchResult[]>;
  listTrash(): Promise<TrashWorkspace[]>;
  restoreTrashedWorkspace(id: string): Promise<Workspace>;
  deleteTrashedWorkspace(id: string): Promise<void>;
  restoreLibraryBackup(file: File): Promise<void>;
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

    createWorkspaceNote: (workspaceId, input) =>
      request<Note>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes`, {
        method: "POST",
        ...json(input),
      }, transport),

    updateWorkspaceNote: (workspaceId, noteId, input) =>
      request<Note>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        ...json(input),
      }, transport),

    deleteWorkspaceNote: (workspaceId, noteId, version) =>
      request<void>(`/api/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${version}"` },
      }, transport),

    getWorkspaceCanvas: (workspaceId) =>
      request<CanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/canvas`, undefined, transport),

    updateWorkspaceCanvas: (workspaceId, canvas, version) =>
      request<CanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/canvas`, {
        method: "PATCH",
        ...json({ canvas, version }),
      }, transport),

    listAllWorkspaces: (params = {}) => {
      const search = new URLSearchParams();
      if (params.query) search.set("q", params.query);
      if (params.offset) search.set("offset", String(params.offset));
      if (params.limit) search.set("limit", String(params.limit));
      return request<WorkspacePage>(`/api/workspaces?${search}`, undefined, transport);
    },

    listCategories: () =>
      request<CategorySummary[]>("/api/categories", undefined, transport),

    listCategoryWorkspaces: (categoryId, params = {}) => {
      const search = new URLSearchParams();
      if (params.query) search.set("q", params.query);
      if (params.sort) search.set("sort", params.sort);
      if (params.hasCanvas) search.set("hasCanvas", "true");
      if (params.hasNotes) search.set("hasNotes", "true");
      if (params.offset) search.set("offset", String(params.offset));
      if (params.limit) search.set("limit", String(params.limit));
      return request<WorkspacePage>(
        `/api/categories/${encodeURIComponent(categoryId)}/workspaces?${search}`,
        undefined,
        transport,
      );
    },

    createWorkspace: (title, categoryId) =>
      request<Workspace>("/api/workspaces", {
        method: "POST",
        ...json({ title, ...(categoryId ? { categoryId } : {}) }),
      }, transport),

    createCategory: (title) =>
      request<CategorySummary>("/api/categories", {
        method: "POST",
        ...json({ title }),
      }, transport),

    updateCategory: (id, title) =>
      request<CategorySummary>(`/api/categories/${encodeURIComponent(id)}`, {
        method: "PATCH",
        ...json({ title }),
      }, transport),

    deleteCategory: (id) =>
      request<void>(`/api/categories/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, transport),

    renameWorkspace: (id, title) =>
      request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}/title`, {
        method: "PATCH",
        ...json({ title }),
      }, transport),

    deleteWorkspace: (id, expectedVersion) =>
      request<void>(`/api/workspaces/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${expectedVersion}"` },
      }, transport),

    moveWorkspace: (id, categoryId) =>
      request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}/category`, {
        method: "PATCH",
        ...json({ categoryId }),
      }, transport),

    searchNotespace: (query) =>
      request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`, undefined, transport),

    listTrash: () =>
      request<TrashWorkspace[]>("/api/trash", undefined, transport),

    restoreTrashedWorkspace: (id) =>
      request<Workspace>(`/api/trash/${encodeURIComponent(id)}`, {
        method: "POST",
      }, transport),

    deleteTrashedWorkspace: (id) =>
      request<void>(`/api/trash/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, transport),

    restoreLibraryBackup: (file) =>
      request<void>("/api/backup/restore", {
        method: "POST",
        headers: {
          "Content-Type": file.name.toLowerCase().endsWith(".zip")
            ? "application/zip"
            : (file.type || "application/json"),
        },
        body: file,
        signal: AbortSignal.timeout(120_000),
      }, transport),
  };
}

const defaultWorkspaceClient = createWorkspaceHttpClient();

export const getWorkspace = defaultWorkspaceClient.getWorkspace;
export const updateWorkspaceSnapshot = defaultWorkspaceClient.updateWorkspaceSnapshot;
export const createWorkspaceNote = defaultWorkspaceClient.createWorkspaceNote;
export const updateWorkspaceNote = defaultWorkspaceClient.updateWorkspaceNote;
export const deleteWorkspaceNote = defaultWorkspaceClient.deleteWorkspaceNote;
export const getWorkspaceCanvas = defaultWorkspaceClient.getWorkspaceCanvas;
export const updateWorkspaceCanvas = defaultWorkspaceClient.updateWorkspaceCanvas;
export const listAllWorkspaces = defaultWorkspaceClient.listAllWorkspaces;
export const listCategories = defaultWorkspaceClient.listCategories;
export const listCategoryWorkspaces = defaultWorkspaceClient.listCategoryWorkspaces;
export const createWorkspace = defaultWorkspaceClient.createWorkspace;
export const createCategory = defaultWorkspaceClient.createCategory;
export const updateCategory = defaultWorkspaceClient.updateCategory;
export const deleteCategory = defaultWorkspaceClient.deleteCategory;
export const renameWorkspace = defaultWorkspaceClient.renameWorkspace;
export const deleteWorkspace = defaultWorkspaceClient.deleteWorkspace;
export const moveWorkspace = defaultWorkspaceClient.moveWorkspace;
export const searchNotespace = defaultWorkspaceClient.searchNotespace;
export const listTrash = defaultWorkspaceClient.listTrash;
export const restoreTrashedWorkspace = defaultWorkspaceClient.restoreTrashedWorkspace;
export const deleteTrashedWorkspace = defaultWorkspaceClient.deleteTrashedWorkspace;
export const restoreLibraryBackup = defaultWorkspaceClient.restoreLibraryBackup;

export const listRecentWorkspaces = async (limit = 12) =>
  (await listAllWorkspaces({ limit })).items;

export const getCategory = async (id: string) => {
  const categories = await listCategories();
  const category = categories.find((item) => item.id === id);
  if (!category) throw new APIError(404, "Category not found.");
  return category;
};

export async function listAllCategoryWorkspaces(categoryId: string) {
  const items: WorkspaceSummary[] = [];
  let offset = 0;
  while (true) {
    const page = await listCategoryWorkspaces(categoryId, {
      sort: "name",
      offset,
      limit: 100,
    });
    items.push(...page.items);
    if (page.nextOffset === undefined || page.nextOffset <= offset) return items;
    offset = page.nextOffset;
  }
}

export const exportLibraryBackup = () => "/api/backup";
