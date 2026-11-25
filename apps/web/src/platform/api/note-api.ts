import type { NoteDocument } from "../../entities/note";
import type { Snapshot } from "../../entities/workspace";
import { fetchTransport, json, request, type HttpTransport } from "./client";

export type Note = {
  id: string;
  schemaVersion: number;
  revision: number;
  document: NoteDocument;
  createdAt: string;
  updatedAt: string;
  /** Set while the Note is in Trash; it stays readable but cannot be edited or placed. */
  deletedAt?: string;
};

export type TrashedNote = {
  id: string;
  label: string;
  excerpt: string;
  deletedAt: string;
  placementCount: number;
};

type NoteInstance = {
  id: string;
  noteId: string;
  workspaceId: string;
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  compact: boolean;
  createdAt: string;
  updatedAt: string;
};

type NoteCanvasState = { canvas: Snapshot; version: number; updatedAt: string };

export type CreateNoteInstanceRequest = {
  clientRequestId: string;
  clientNoteId: string;
  clientInstanceId: string;
  existingNoteId?: string;
  elementId: string;
  expectedCanvasVersion: number;
  document?: NoteDocument;
  canvas: Snapshot;
  x: number;
  y: number;
  width: number;
  height: number;
  compact?: boolean;
};

export type CreateNoteInstanceResult = { note: Note; instance: NoteInstance; canvas: NoteCanvasState };

export type NoteSummary = {
  id: string;
  label: string;
  excerpt: string;
  placementCount: number;
  workspaceIds: string[];
  isEmpty: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListNotesParams = {
  q?: string;
  unplaced?: boolean;
  limit?: number;
};

export type NotePlacementInfo = {
  instanceId: string;
  workspaceId: string;
  workspaceTitle: string;
  elementId: string;
  compact: boolean;
};

export type NoteBacklinkKind = "link" | "embed" | "blockRef";

export type NoteBacklinkInfo = {
  noteId: string;
  label: string;
  workspaceId: string;
  workspaceTitle: string;
  kind: NoteBacklinkKind;
};

export type NoteInfo = {
  noteId: string;
  placements: NotePlacementInfo[];
  backlinks: NoteBacklinkInfo[];
};

interface NoteHttpClient {
  getNote(noteId: string): Promise<Note>;
  listNotes(params?: ListNotesParams): Promise<NoteSummary[]>;
  getNoteInfo(noteId: string): Promise<NoteInfo>;
  updateNote(noteId: string, document: NoteDocument, expectedRevision: number): Promise<Note>;
  createNoteInstance(workspaceId: string, request: CreateNoteInstanceRequest): Promise<CreateNoteInstanceResult>;
  deleteNoteInstance(workspaceId: string, instanceId: string, canvas: Snapshot, expectedCanvasVersion: number): Promise<NoteCanvasState>;
  deleteNote(noteId: string): Promise<void>;
  trashNote(noteId: string): Promise<void>;
  listTrashedNotes(): Promise<TrashedNote[]>;
  restoreTrashedNote(noteId: string): Promise<void>;
  deleteTrashedNote(noteId: string): Promise<void>;
}

function createNoteHttpClient(transport: HttpTransport = fetchTransport): NoteHttpClient {
  return {
    getNote: (noteId) => request<Note>(`/api/notes/${encodeURIComponent(noteId)}`, undefined, transport),
    listNotes: async (params) => {
      const search = new URLSearchParams();
      const query = params?.q?.trim();
      if (query) search.set("q", query);
      if (params?.unplaced) search.set("unplaced", "true");
      if (typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
        search.set("limit", String(Math.floor(params.limit)));
      }
      const qs = search.toString();
      const response = await request<{ notes: NoteSummary[] }>(`/api/notes${qs ? `?${qs}` : ""}`, undefined, transport);
      return Array.isArray(response?.notes) ? response.notes : [];
    },
    getNoteInfo: (noteId) => request<NoteInfo>(`/api/notes/${encodeURIComponent(noteId)}/info`, undefined, transport),
    updateNote: (noteId, document, expectedRevision) => request<Note>(`/api/notes/${encodeURIComponent(noteId)}`, {
      method: "PUT",
      ...json({ document, expectedRevision }),
    }, transport),
    createNoteInstance: (workspaceId, body) => request<CreateNoteInstanceResult>(`/api/workspaces/${encodeURIComponent(workspaceId)}/note-instances`, {
      method: "POST",
      ...json(body),
    }, transport),
    deleteNoteInstance: (workspaceId, instanceId, canvas, expectedCanvasVersion) => request<NoteCanvasState>(`/api/workspaces/${encodeURIComponent(workspaceId)}/note-instances/${encodeURIComponent(instanceId)}`, {
      method: "DELETE",
      ...json({ canvas, expectedCanvasVersion }),
    }, transport),
    deleteNote: (noteId) => request<void>(`/api/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }, transport),
    trashNote: (noteId) => request<void>(`/api/notes/${encodeURIComponent(noteId)}/trash`, { method: "POST" }, transport),
    listTrashedNotes: async () => {
      const items = await request<TrashedNote[] | null>("/api/trash/notes", undefined, transport);
      return Array.isArray(items) ? items : [];
    },
    restoreTrashedNote: (noteId) => request<void>(`/api/trash/notes/${encodeURIComponent(noteId)}`, { method: "POST" }, transport),
    deleteTrashedNote: (noteId) => request<void>(`/api/trash/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }, transport),
  };
}

const defaultClient = createNoteHttpClient();
export const getNote = defaultClient.getNote;
export const listNotes = defaultClient.listNotes;
export const getNoteInfo = defaultClient.getNoteInfo;
export const updateNote = defaultClient.updateNote;
export const createNoteInstance = defaultClient.createNoteInstance;
export const deleteNoteInstance = defaultClient.deleteNoteInstance;
export const deleteNote = defaultClient.deleteNote;
export const trashNote = defaultClient.trashNote;
export const listTrashedNotes = defaultClient.listTrashedNotes;
export const restoreTrashedNote = defaultClient.restoreTrashedNote;
export const deleteTrashedNote = defaultClient.deleteTrashedNote;
