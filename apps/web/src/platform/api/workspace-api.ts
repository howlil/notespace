import type {
  Workspace,
  Snapshot,
  WorkspacePage,
} from "../../entities/workspace";
import {
  fetchTransport,
  json,
  request,
  type HttpTransport,
} from "./client.ts";

export { APIError } from "./client.ts";

export type CanvasState = { canvas: Snapshot; version: number; updatedAt: string };
export type SearchResult = {
  type: "workspace" | "note";
  parentId?: string | null;
  parentTitle?: string;
  workspaceId: string;
  workspaceTitle: string;
  excerpt: string;
  noteId?: string;
  instanceId?: string;
  elementId?: string;
};
export type TrashWorkspace = {
  id: string;
  parentId: string | null;
  parentTitle?: string;
  title: string;
  deletedAt: string;
};

export type WorkspaceListParams = {
  rootOnly?: boolean;
  parentId?: string;
  query?: string;
  sort?: string;
  hasCanvas?: boolean;
  offset?: number;
  limit?: number;
  snapshot?: string;
};

function buildWorkspaceListPath(params: WorkspaceListParams = {}) {
  const search = new URLSearchParams();
  if (params.rootOnly) search.set("rootOnly", "true");
  if (params.parentId) search.set("parentId", params.parentId);
  if (params.query) search.set("q", params.query);
  if (params.sort) search.set("sort", params.sort);
  if (params.hasCanvas) search.set("hasCanvas", "true");
  if (params.snapshot) search.set("snapshot", params.snapshot);
  if (params.offset) search.set("offset", String(params.offset));
  if (params.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `/api/workspaces?${qs}` : "/api/workspaces";
}

interface WorkspaceHttpClient {
  getWorkspace(id: string): Promise<Workspace>;
  getWorkspaceCanvas(workspaceId: string): Promise<CanvasState>;
  updateWorkspaceCanvas(workspaceId: string, canvas: Snapshot, version: number): Promise<CanvasState>;
  listWorkspaces(params?: WorkspaceListParams): Promise<WorkspacePage>;
  listAllWorkspaces(params?: Omit<WorkspaceListParams, "rootOnly" | "parentId">): Promise<WorkspacePage>;
  listRootWorkspaces(params?: Omit<WorkspaceListParams, "rootOnly" | "parentId">): Promise<WorkspacePage>;
  listChildWorkspaces(parentId: string, params?: Omit<WorkspaceListParams, "rootOnly" | "parentId">): Promise<WorkspacePage>;
  createWorkspace(title: string, parentId?: string | null, creationId?: string): Promise<Workspace>;
  renameWorkspace(id: string, title: string, expectedTitle?: string): Promise<Workspace>;
  moveWorkspaceParent(id: string, parentId: string | null, expectedParentId?: string | null): Promise<Workspace>;
  reparentWorkspaceChildren(id: string, targetParentId: string | null): Promise<{ moved: number }>;
  deleteWorkspace(id: string, expectedVersion: number): Promise<void>;
  resolveLegacyCategory(id: string): Promise<{ workspaceId: string | null }>;
  searchNotespace(query: string): Promise<SearchResult[]>;
  listTrash(): Promise<TrashWorkspace[]>;
  restoreTrashedWorkspace(id: string): Promise<Workspace>;
  deleteTrashedWorkspace(id: string): Promise<void>;
  restoreLibraryBackup(file: File): Promise<void>;
}

export function createWorkspaceHttpClient(
  transport: HttpTransport = fetchTransport,
): WorkspaceHttpClient {
  const listWorkspaces = (params: WorkspaceListParams = {}) =>
    request<WorkspacePage>(buildWorkspaceListPath(params), undefined, transport);

  return {
    getWorkspace: (id) =>
      request<Workspace>(
        `/api/workspaces/${encodeURIComponent(id)}`,
        undefined,
        transport,
      ),

    getWorkspaceCanvas: (workspaceId) =>
      request<CanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/canvas`, undefined, transport),

    updateWorkspaceCanvas: (workspaceId, canvas, version) =>
      request<CanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/canvas`, {
        method: "PATCH",
        ...json({ canvas, version }),
      }, transport),

    listWorkspaces,
    listAllWorkspaces: (params = {}) => listWorkspaces(params),
    listRootWorkspaces: (params = {}) => listWorkspaces({ ...params, rootOnly: true }),
    listChildWorkspaces: (parentId, params = {}) => listWorkspaces({ ...params, parentId }),

    createWorkspace: async (title, parentId = null, creationId = crypto.randomUUID()) => {
      const normalizedParent = parentId ?? null;
      try {
        return await request<Workspace>("/api/workspaces", {
          method: "POST",
          ...json({ id: creationId, title, ...(normalizedParent ? { parentId: normalizedParent } : {}) }),
        }, transport);
      } catch (error) {
        try {
          const saved = await request<Workspace>(`/api/workspaces/${encodeURIComponent(creationId)}`, undefined, transport);
          if (saved.title === title.trim() && (saved.parentId ?? null) === normalizedParent) {
            return saved;
          }
        } catch { /* Unknown read: caller must keep its creation ID for retry. */ }
        throw error;
      }
    },

    renameWorkspace: (id, title, expectedTitle) =>
      request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}/title`, {
        method: "PATCH",
        ...json({ title, ...(expectedTitle === undefined ? {} : { expectedTitle }) }),
      }, transport),

    moveWorkspaceParent: (id, parentId, expectedParentId) =>
      request<Workspace>(`/api/workspaces/${encodeURIComponent(id)}/parent`, {
        method: "PATCH",
        ...json({ parentId, ...(expectedParentId === undefined ? {} : { expectedParentId }) }),
      }, transport),

    reparentWorkspaceChildren: (id, targetParentId) =>
      request<{ moved: number }>(`/api/workspaces/${encodeURIComponent(id)}/reparent-children`, {
        method: "POST",
        ...json({ targetParentId }),
      }, transport),

    deleteWorkspace: (id, expectedVersion) =>
      request<void>(`/api/workspaces/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "If-Match": `"${expectedVersion}"` },
      }, transport),

    resolveLegacyCategory: (id) =>
      request<{ workspaceId: string | null }>(`/api/legacy/categories/${encodeURIComponent(id)}`, undefined, transport),

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
export const getWorkspaceCanvas = defaultWorkspaceClient.getWorkspaceCanvas;
export const updateWorkspaceCanvas = defaultWorkspaceClient.updateWorkspaceCanvas;
export const listWorkspaces = defaultWorkspaceClient.listWorkspaces;
export const listAllWorkspaces = defaultWorkspaceClient.listAllWorkspaces;
export const listRootWorkspaces = defaultWorkspaceClient.listRootWorkspaces;
export const listChildWorkspaces = defaultWorkspaceClient.listChildWorkspaces;
export const createWorkspace = defaultWorkspaceClient.createWorkspace;
export const renameWorkspace = defaultWorkspaceClient.renameWorkspace;
export const moveWorkspaceParent = defaultWorkspaceClient.moveWorkspaceParent;
export const reparentWorkspaceChildren = defaultWorkspaceClient.reparentWorkspaceChildren;
export const deleteWorkspace = defaultWorkspaceClient.deleteWorkspace;
export const resolveLegacyCategory = defaultWorkspaceClient.resolveLegacyCategory;
export const searchNotespace = defaultWorkspaceClient.searchNotespace;
export const listTrash = defaultWorkspaceClient.listTrash;
export const restoreTrashedWorkspace = defaultWorkspaceClient.restoreTrashedWorkspace;
export const deleteTrashedWorkspace = defaultWorkspaceClient.deleteTrashedWorkspace;
export const restoreLibraryBackup = defaultWorkspaceClient.restoreLibraryBackup;

export const listRecentWorkspaces = async (limit = 12) =>
  (await listAllWorkspaces({ limit })).items;

export const exportLibraryBackup = () => "/api/backup";
