import { fetchTransport, json, request, type HttpTransport } from "./client";

export type Tag = {
  id: string;
  name: string;
  normalizedKey: string;
  createdAt: string;
  updatedAt: string;
};

interface TagHttpClient {
  listTags(): Promise<Tag[]>;
  createTag(name: string): Promise<Tag>;
  renameTag(tagId: string, name: string): Promise<Tag>;
  deleteTag(tagId: string): Promise<void>;
  assignNoteTag(noteId: string, tagId: string): Promise<void>;
  removeNoteTag(noteId: string, tagId: string): Promise<void>;
  batchUpdateNoteTags(noteIds: string[], addTagIds: string[], removeTagIds: string[]): Promise<void>;
}

function createTagHttpClient(transport: HttpTransport = fetchTransport): TagHttpClient {
  return {
    listTags: async () => {
      const response = await request<{ tags?: Tag[] } | Tag[] | null>("/api/tags", undefined, transport);
      if (Array.isArray(response)) return response;
      return Array.isArray(response?.tags) ? response.tags : [];
    },
    createTag: (name) => request<Tag>("/api/tags", {
      method: "POST",
      ...json({ name }),
    }, transport),
    renameTag: (tagId, name) => request<Tag>(`/api/tags/${encodeURIComponent(tagId)}`, {
      method: "PATCH",
      ...json({ name }),
    }, transport),
    deleteTag: (tagId) => request<void>(`/api/tags/${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    }, transport),
    assignNoteTag: (noteId, tagId) => request<void>(`/api/notes/${encodeURIComponent(noteId)}/tags`, {
      method: "POST",
      ...json({ tagId }),
    }, transport),
    removeNoteTag: (noteId, tagId) => request<void>(`/api/notes/${encodeURIComponent(noteId)}/tags/${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    }, transport),
    batchUpdateNoteTags: (noteIds, addTagIds, removeTagIds) => request<void>("/api/notes/batch-tags", {
      method: "POST",
      ...json({ noteIds, addTagIds, removeTagIds }),
    }, transport),
  };
}

const defaultClient = createTagHttpClient();
export const listTags = defaultClient.listTags;
export const createTag = defaultClient.createTag;
export const renameTag = defaultClient.renameTag;
export const deleteTag = defaultClient.deleteTag;
export const assignNoteTag = defaultClient.assignNoteTag;
export const removeNoteTag = defaultClient.removeNoteTag;
export const batchUpdateNoteTags = defaultClient.batchUpdateNoteTags;
