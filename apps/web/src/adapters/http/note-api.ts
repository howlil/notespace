import type { NoteDocument } from "../../domain/note/note";
import type { Snapshot } from "../../domain/workspace/workspace";
import { fetchTransport, json, request, type HttpTransport } from "./client";

export type Note = {
  id: string;
  schemaVersion: number;
  revision: number;
  document: NoteDocument;
  createdAt: string;
  updatedAt: string;
};

export type NoteInstance = {
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

export type NoteCanvasState = { canvas: Snapshot; version: number; updatedAt: string };

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

export interface NoteHttpClient {
  getNote(noteId: string): Promise<Note>;
  updateNote(noteId: string, document: NoteDocument, expectedRevision: number): Promise<Note>;
  createNoteInstance(workspaceId: string, request: CreateNoteInstanceRequest): Promise<CreateNoteInstanceResult>;
  deleteNoteInstance(workspaceId: string, instanceId: string, canvas: Snapshot, expectedCanvasVersion: number): Promise<NoteCanvasState>;
}

export function createNoteHttpClient(transport: HttpTransport = fetchTransport): NoteHttpClient {
  return {
    getNote: (noteId) => request<Note>(`/api/notes/${encodeURIComponent(noteId)}`, undefined, transport),
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
  };
}

const defaultClient = createNoteHttpClient();
export const getNote = defaultClient.getNote;
export const updateNote = defaultClient.updateNote;
export const createNoteInstance = defaultClient.createNoteInstance;
export const deleteNoteInstance = defaultClient.deleteNoteInstance;
